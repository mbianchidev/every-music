import { musicianRepository } from '../repositories/musician-repository.js';
import { realmConnector } from '../repositories/realm-connector.js';
import { InputValidator } from '../validators/input-validator.js';
import { communityRepository, publishEvent } from '../repositories/community-repository.js';
import { requestError } from '../engines/request-error.js';

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
        data: this.transformProfile(profile),
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
        await musicianRepository.updateProfile(profile.id, { ...updateData, profilePictureUrl }, executor);

        if (updateData.instruments !== undefined) {
          await musicianRepository.attachInstruments(profile.id, updateData.instruments, executor);
        }

        if (updateData.genreIds !== undefined) {
          await musicianRepository.attachGenres(profile.id, updateData.genreIds, executor);
        }
        await publishEvent(executor, 'profiles.changed', { id: userId });
      });

      const refreshedProfile = await musicianRepository.findByUserId(userId);

      return reply.code(200).send({
        success: true,
        data: this.transformProfile(refreshedProfile),
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
    const { city, instrumentId, genreId, searchTerm, sort = 'newest', page = 1, pageSize = 20 } = request.query;

    const paginationResult = InputValidator.parsePagination(page, pageSize);
    const queryValidation = InputValidator.gatherValidationErrors(
      paginationResult,
      InputValidator.validateUuid(instrumentId, 'Instrument ID'),
      InputValidator.validateUuid(genreId, 'Genre ID'),
      InputValidator.validateEnum(sort, ['newest', 'oldest', 'name', 'city'], 'Sort'),
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

    try {
      const filters = { city, instrumentId, genreId, searchTerm, sort };
      const pagination = paginationResult.pagination;

      const profiles = await musicianRepository.searchProfiles(filters, {
        ...pagination,
        limit: pagination.pageSize + 1,
      });
      const hasMore = profiles.length > pagination.pageSize;

      return reply.code(200).send({
        success: true,
        data: {
          profiles: profiles.slice(0, pagination.pageSize).map(p => this.transformBasicProfile(p)),
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
        data: this.transformProfile(profile),
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

  transformProfile(profile) {
    return {
      id: profile.id,
      userId: profile.user_id,
      isFollowing: Boolean(profile.is_following),
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
      artistName: profile.artist_name,
      firstName: profile.first_name,
      lastName: profile.last_name,
      city: profile.city,
      state: profile.state,
      country: profile.country,
      bio: profile.bio,
      profilePictureUrl: profile.profile_picture_url,
      createdAt: profile.created_at,
    };
  }
}

export const musicianConductor = new MusicianConductor();
