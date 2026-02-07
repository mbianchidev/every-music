import { musicianRepository } from '../repositories/musician-repository.js';
import { InputValidator } from '../validators/input-validator.js';

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
      request.log.error('Failed to fetch profile:', err);
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
    const updateData = request.body;

    const validations = InputValidator.gatherValidationErrors(
      InputValidator.validateLength(updateData.artistName, 1, 255, 'Artist name'),
      InputValidator.validateLength(updateData.firstName, 1, 100, 'First name'),
      InputValidator.validateLength(updateData.lastName, 1, 100, 'Last name'),
      InputValidator.validateAge(updateData.age),
      InputValidator.validateUrl(updateData.websiteUrl),
      InputValidator.validateUrl(updateData.profilePictureUrl),
      InputValidator.validateCoordinates(updateData.latitude, updateData.longitude)
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
      let profile = await musicianRepository.findByUserId(userId);

      if (!profile) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'PROFILE_NOT_FOUND',
            message: 'Profile not found',
          },
        });
      }

      const updatedProfile = await musicianRepository.updateProfile(profile.id, updateData);

      if (updateData.instruments) {
        await musicianRepository.attachInstruments(profile.id, updateData.instruments);
      }

      if (updateData.genreIds) {
        await musicianRepository.attachGenres(profile.id, updateData.genreIds);
      }

      const refreshedProfile = await musicianRepository.findByUserId(userId);

      return reply.code(200).send({
        success: true,
        data: this.transformProfile(refreshedProfile),
      });
    } catch (err) {
      request.log.error('Failed to update profile:', err);
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
    const { city, instrumentId, genreId, searchTerm, page = 1, pageSize = 20 } = request.query;

    try {
      const filters = { city, instrumentId, genreId, searchTerm };
      const pagination = { 
        page: parseInt(page), 
        pageSize: Math.min(parseInt(pageSize), 100) 
      };

      const profiles = await musicianRepository.searchProfiles(filters, pagination);

      return reply.code(200).send({
        success: true,
        data: {
          profiles: profiles.map(p => this.transformBasicProfile(p)),
          pagination: {
            page: pagination.page,
            pageSize: pagination.pageSize,
            hasMore: profiles.length === pagination.pageSize,
          },
        },
      });
    } catch (err) {
      request.log.error('Failed to search profiles:', err);
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

    try {
      const profile = await musicianRepository.findByUserId(profileId);

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
      request.log.error('Failed to fetch profile:', err);
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
    const projectData = request.body;

    const validations = InputValidator.gatherValidationErrors(
      InputValidator.validateRequired(projectData.name, 'Project name'),
      InputValidator.validateLength(projectData.name, 1, 255, 'Project name'),
      InputValidator.validateUrl(projectData.spotifyLink),
      InputValidator.validateUrl(projectData.youtubeLink),
      InputValidator.validateUrl(projectData.bandcampLink)
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

      const project = await musicianRepository.addProject(profile.id, projectData);

      return reply.code(201).send({
        success: true,
        data: project,
      });
    } catch (err) {
      request.log.error('Failed to add project:', err);
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

      const result = await musicianRepository.removeProject(projectId, profile.id);

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
      request.log.error('Failed to remove project:', err);
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
