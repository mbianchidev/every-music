import { musicianRepository } from '../repositories/musician-repository.js';
import { realmConnector } from '../repositories/realm-connector.js';
import { InputValidator } from '../validators/input-validator.js';
import { communityRepository, publishEvent } from '../repositories/community-repository.js';
import { requestError } from '../engines/request-error.js';
import { entitlementRepository } from '../repositories/entitlement-repository.js';
import { joinedPlace } from '../repositories/place-repository.js';
import { socialRepository } from '../repositories/social-repository.js';
import { placeFields, resolveLocation, validatePlaceId } from './discovery-conductor.js';
import {
  CONTACT_VISIBILITY, PROFILE_LINK_TYPES, canSeeContacts, limitShown, normalizeContact, validateContact,
} from '../engines/profile-policy.js';
import { placeProfiles, withPromotion } from '../engines/discovery-placements.js';

const contactFields = ['phone', 'telegramId', 'whatsapp', 'signal'];

function validateProfileLinks(value) {
  if (value === undefined) return { valid: true };
  if (!Array.isArray(value) || value.length > 20) return { valid: false, message: 'Add at most 20 profile links' };
  const invalid = value.some(link => !link || typeof link !== 'object'
    || !PROFILE_LINK_TYPES.includes(link.linkType || 'other')
    || typeof link.url !== 'string' || !link.url.trim() || !InputValidator.validateUrl(link.url.trim()).valid);
  return invalid ? { valid: false, message: 'Profile links need a supported type and an HTTP or HTTPS URL' } : { valid: true };
}

export class MusicianConductor {
  async getMyProfile(request, reply) {
    const { userId } = request.authenticatedUser;

    try {
      const profile = await musicianRepository.findByUserId(userId);

      if (!profile) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'PROFILE_NOT_FOUND',
            message: 'Profile not found',
          },
        });
      }

      return reply.code(200).send({
        success: true,
        data: await this.viewProfile(profile, userId),
      });
    } catch (err) {
      request.log.error({ err }, 'Failed to fetch profile');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: 'Failed to fetch profile',
        },
      });
    }
  }

  async updateMyProfile(request, reply) {
    const { userId } = request.authenticatedUser;
    const updateData = request.body ?? {};

    const validations = InputValidator.gatherValidationErrors(
      InputValidator.validateLength(updateData.artistName, 1, 255, 'Artist name'),
      InputValidator.validateLength(updateData.firstName, 0, 100, 'First name'),
      InputValidator.validateLength(updateData.lastName, 0, 100, 'Last name'),
      InputValidator.validateLength(updateData.city, 0, 255, 'City'),
      InputValidator.validateLength(updateData.bio, 0, 5000, 'Bio'),
      InputValidator.validateAge(updateData.age),
      InputValidator.validateUrl(updateData.websiteUrl),
      InputValidator.validateImageUrl(updateData.profilePictureUrl),
      InputValidator.validateCoordinates(updateData.latitude, updateData.longitude),
      InputValidator.validateInstruments(updateData.instruments),
      InputValidator.validateUuidArray(updateData.genreIds, 'Genre IDs'),
      validatePlaceId(updateData.placeId),
      InputValidator.validateEnum(updateData.contactVisibility, CONTACT_VISIBILITY, 'Contact visibility'),
      [null, ''].includes(updateData.contactVisibility) ? { valid: false, message: 'Contact visibility is required' } : { valid: true },
      InputValidator.validateBoolean(updateData.openToProjects, 'Open to new projects'),
      ...contactFields.map(key => validateContact(key, updateData[key])),
      validateProfileLinks(updateData.links),
      InputValidator.validateEnum(updateData.accountKind, ['artist', 'music_lover'], 'Account kind'),
    );

    if (validations) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: validations,
        },
      });
    }

    for (const key of [...contactFields, 'websiteUrl']) updateData[key] = normalizeContact(updateData[key]);

    try {
      const profile = await musicianRepository.findByUserId(userId);

      if (!profile) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'PROFILE_NOT_FOUND',
            message: 'Profile not found',
          },
        });
      }

      await realmConnector.transaction(async (executor) => {
        const profilePictureUrl = await communityRepository.mediaReference(executor, updateData.profilePictureUrl, userId, 'profile');
        await musicianRepository.updateProfile(profile.id, {
          ...updateData, profilePictureUrl, ...await placeFields(updateData, executor),
        }, executor);

        if (updateData.links !== undefined) {
          await musicianRepository.attachLinks(profile.id, updateData.links, executor);
        }

        if (updateData.instruments !== undefined) {
          await musicianRepository.attachInstruments(profile.id, updateData.instruments, executor);
        }

        if (updateData.genreIds !== undefined) {
          await musicianRepository.attachGenres(profile.id, updateData.genreIds, executor);
        }
        await publishEvent(executor, 'profiles.changed', { id: userId });
      });

      const refreshedProfile = await musicianRepository.findByUserId(userId, realmConnector, userId);

      return reply.code(200).send({
        success: true,
        data: await this.viewProfile(refreshedProfile, userId),
      });
    } catch (err) {
      if (err.statusCode) throw err;
      request.log.error({ err }, 'Failed to update profile');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'UPDATE_FAILED',
          message: 'Failed to update profile',
        },
      });
    }
  }

  async searchProfiles(request, reply) {
    const { city, instrumentId, genreId, searchTerm, createdWithin, sort = 'newest', page = 1, pageSize = 20 } = request.query;

    const paginationResult = InputValidator.parsePagination(page, pageSize);
    const openResult = InputValidator.parseOptionalBoolean(request.query.openToProjects, 'Open to new projects');
    const queryValidation = InputValidator.gatherValidationErrors(
      paginationResult,
      openResult,
      InputValidator.validateUuid(instrumentId, 'Instrument ID'),
      InputValidator.validateUuid(genreId, 'Genre ID'),
      InputValidator.validateEnum(sort, ['newest', 'oldest', 'name', 'city', 'distance'], 'Sort'),
      InputValidator.validateEnum(createdWithin, ['week', 'month'], 'Creation date'),
      InputValidator.validateLength(searchTerm, 0, 200, 'Search term'),
      InputValidator.validateLength(city, 0, 255, 'City'),
    );
    if (queryValidation) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid search query',
          details: queryValidation,
        },
      });
    }

    const location = await resolveLocation(request.query);
    if (sort === 'distance' && !location.center) {
      throw requestError(400, 'VALIDATION_ERROR', 'Choose a place or use your location before sorting by distance');
    }

    try {
      const filters = {
        city, instrumentId, genreId, searchTerm, createdWithin, sort, location,
        openToProjects: openResult.value, viewerId: request.authenticatedUser?.userId,
      };
      const pagination = paginationResult.pagination;

      const profiles = await musicianRepository.searchProfiles(filters, {
        ...pagination,
        limit: pagination.pageSize + 1,
      });
      const hasMore = profiles.length > pagination.pageSize;
      const placed = await placeProfiles({
        search: (...args) => musicianRepository.searchProfiles(...args), filters, page: pagination.page,
        rows: profiles.slice(0, pagination.pageSize),
      });

      return reply.code(200).send({
        success: true,
        data: {
          profiles: placed.rows.map(p => withPromotion(p, this.transformBasicProfile(p))),
          sponsored: placed.sponsored,
          pagination: {
            page: pagination.page,
            pageSize: pagination.pageSize,
            hasMore,
          },
        },
      });
    } catch (err) {
      request.log.error({ err }, 'Failed to search profiles');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'SEARCH_FAILED',
          message: 'Failed to search profiles',
        },
      });
    }
  }

  async getProfileById(request, reply) {
    const { profileId } = request.params;
    const currentUserId = request.authenticatedUser?.userId;

    try {
      const profile = await musicianRepository.findByUserId(profileId, realmConnector, currentUserId)
        || await musicianRepository.findById(profileId, realmConnector, currentUserId);

      if (!profile || profile.blocks_viewer) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'PROFILE_NOT_FOUND',
            message: 'Profile not found',
          },
        });
      }

      if (currentUserId && currentUserId !== profile.user_id) {
        try {
          await socialRepository.recordVisit(profile.user_id, currentUserId);
        } catch (err) {
          request.log.error({ err }, 'Failed to record a consented profile visit');
        }
      }

      return reply.code(200).send({
        success: true,
        data: await this.viewProfile(profile, currentUserId),
      });
    } catch (err) {
      request.log.error({ err }, 'Failed to fetch profile');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: 'Failed to fetch profile',
        },
      });
    }
  }

  async addProject(request, reply) {
    const { userId } = request.authenticatedUser;
    const projectData = { ...request.body };
    const projectId = request.params.projectId;

    const validations = InputValidator.gatherValidationErrors(
      projectId ? { valid: true } : InputValidator.validateRequired(projectData.name, 'Project name'),
      InputValidator.validateLength(projectData.name, 1, 255, 'Project name'),
      InputValidator.validateLength(projectData.role, 0, 255, 'Role'),
      InputValidator.validateLength(projectData.yearsActive, 0, 100, 'Years active'),
      InputValidator.validateLength(projectData.description, 0, 5000, 'Description'),
      InputValidator.validateUrl(projectData.spotifyLink),
      InputValidator.validateUrl(projectData.youtubeLink),
      InputValidator.validateUrl(projectData.bandcampLink),
      InputValidator.validateUrl(projectData.soundcloudLink),
      InputValidator.validateUrl(projectData.websiteLink),
      InputValidator.validateCollaborators(projectData.collaborators),
    );

    if (validations) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: validations,
        },
      });
    }

    if (projectData.collaborators !== undefined) {
      projectData.collaborators = projectData.collaborators.map(({ userId, role }) => ({ userId: userId.toLowerCase(), role: role.trim() }));
    }

    try {
      const profile = await musicianRepository.findByUserId(userId);

      if (!profile) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'PROFILE_NOT_FOUND',
            message: 'Profile not found',
          },
        });
      }

      const project = await realmConnector.transaction(async (executor) => {
        if (projectData.collaborators?.length) {
          const ids = projectData.collaborators.map(c => c.userId);
          const { rowCount } = await executor.execute(
            'SELECT id FROM users WHERE id = ANY($1::uuid[]) AND is_active = TRUE AND is_deleted = FALSE', [ids],
          );
          if (rowCount !== ids.length) throw requestError(400, 'INVALID_COLLABORATOR', 'Choose existing active musicians');
        }
        const saved = projectId
          ? await musicianRepository.updateProject(projectId, profile.id, projectData, executor)
          : await musicianRepository.addProject(profile.id, projectData, executor);
        if (!saved) throw requestError(404, 'PROJECT_NOT_FOUND', 'Project not found or does not belong to you');
        await publishEvent(executor, 'profiles.changed', { id: userId });
        return saved;
      });

      return reply.code(projectId ? 200 : 201).send({
        success: true,
        data: project,
      });
    } catch (err) {
      if (err.statusCode) throw err;
      request.log.error({ err }, 'Failed to add project');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'ADD_PROJECT_FAILED',
          message: 'Failed to add project',
        },
      });
    }
  }

  async removeProject(request, reply) {
    const { userId } = request.authenticatedUser;
    const { projectId } = request.params;

    try {
      const profile = await musicianRepository.findByUserId(userId);

      if (!profile) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'PROFILE_NOT_FOUND',
            message: 'Profile not found',
          },
        });
      }

      const result = await realmConnector.transaction(async (executor) => {
        const removed = await musicianRepository.removeProject(projectId, profile.id, executor);
        if (removed) await publishEvent(executor, 'profiles.changed', { id: userId });
        return removed;
      });

      if (!result) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'PROJECT_NOT_FOUND',
            message: 'Project not found or does not belong to you',
          },
        });
      }

      return reply.code(200).send({
        success: true,
        data: {
          message: 'Project removed successfully',
        },
      });
    } catch (err) {
      request.log.error({ err }, 'Failed to remove project');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'REMOVE_PROJECT_FAILED',
          message: 'Failed to remove project',
        },
      });
    }
  }

  async viewProfile(profile, viewerId) {
    const { limits } = await entitlementRepository.limitsFor(profile.user_id);
    return this.transformProfile(profile, { viewerId, limits });
  }

  transformProfile(profile, { viewerId = null, limits = {} } = {}) {
    const isOwner = Boolean(viewerId) && viewerId === profile.user_id;
    const projects = limitShown(profile.projects, limits.maxProjectsShown);
    const links = limitShown(profile.links, limits.maxContentShown);
    const contactsVisible = canSeeContacts({
      visibility: profile.contact_visibility, isOwner, viewerId, ownerFollowsViewer: profile.owner_follows_viewer,
      blocked: profile.blocked_by_viewer || profile.blocks_viewer,
    });
    const base = this.transformLegacyProfile(profile);
    return {
      ...base,
      place: joinedPlace(profile),
      contacts: contactsVisible ? base.contacts : null,
      openToProjects: Boolean(profile.open_to_projects_effective),
      followersCount: profile.followers_count ?? 0,
      followingCount: profile.following_count ?? 0,
      isBlocked: Boolean(profile.blocked_by_viewer),
      links: isOwner ? profile.links || [] : links.shown,
      projects: isOwner ? base.projects : projects.shown,
      ...(isOwner ? {
        contactVisibility: profile.contact_visibility,
        openToProjectsManual: Boolean(profile.open_to_projects),
        hasActiveAnnouncement: Boolean(profile.has_active_announcement),
        publicDisplay: {
          maxProjectsShown: limits.maxProjectsShown ?? null,
          maxContentShown: limits.maxContentShown ?? null,
          hiddenProjects: projects.hidden,
          hiddenLinks: links.hidden,
        },
      } : {}),
    };
  }

  transformLegacyProfile(profile) {
    return {
      id: profile.id,
      userId: profile.user_id,
      isFollowing: Boolean(profile.is_following),
      accountKind: profile.account_kind || 'artist',
      artistName: profile.artist_name,
      firstName: profile.first_name,
      lastName: profile.last_name,
      age: profile.age,
      city: profile.city,
      state: profile.state,
      country: profile.country,
      location: profile.latitude && profile.longitude ? {
        latitude: parseFloat(profile.latitude),
        longitude: parseFloat(profile.longitude),
      } : null,
      bio: profile.bio,
      profilePictureUrl: profile.profile_picture_url,
      verifiedAt: profile.verified_at ?? null,
      contacts: {
        phone: profile.phone,
        telegramId: profile.telegram_id,
        whatsapp: profile.whatsapp,
        signal: profile.signal,
        websiteUrl: profile.website_url,
      },
      instruments: profile.instruments || [],
      genres: profile.genres || [],
      projects: profile.projects || [],
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
    };
  }

  transformBasicProfile(profile) {
    return {
      id: profile.id,
      userId: profile.user_id,
      accountKind: profile.account_kind || 'artist',
      artistName: profile.artist_name,
      firstName: profile.first_name,
      lastName: profile.last_name,
      city: profile.city,
      state: profile.state,
      country: profile.country,
      bio: profile.bio,
      profilePictureUrl: profile.profile_picture_url,
      verifiedAt: profile.verified_at ?? null,
      createdAt: profile.created_at,
      instruments: profile.instruments || [],
      genres: profile.genres || [],
      place: joinedPlace(profile),
      openToProjects: Boolean(profile.open_to_projects_effective),
      distanceKm: profile.distance_km === null || profile.distance_km === undefined
        ? null : Math.round(Number(profile.distance_km) * 10) / 10,
    };
  }
}

export const musicianConductor = new MusicianConductor();
