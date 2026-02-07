import { opportunityRepository } from '../repositories/opportunity-repository.js';
import { InputValidator } from '../validators/input-validator.js';

export class OpportunityConductor {
  async createAnnouncement(request, reply) {
    const { userId } = request.authenticatedUser;
    const announcementData = request.body;

    const validations = InputValidator.gatherValidationErrors(
      InputValidator.validateRequired(announcementData.title, 'Title'),
      InputValidator.validateLength(announcementData.title, 5, 255, 'Title'),
      InputValidator.validateRequired(announcementData.description, 'Description'),
      InputValidator.validateLength(announcementData.description, 20, 5000, 'Description'),
      InputValidator.validateUrl(announcementData.pictureUrl),
      InputValidator.validateCoordinates(announcementData.latitude, announcementData.longitude)
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
      const announcement = await opportunityRepository.createAnnouncement(userId, announcementData);

      if (announcementData.instrumentIds && announcementData.instrumentIds.length > 0) {
        await opportunityRepository.attachInstruments(announcement.id, announcementData.instrumentIds);
      }

      if (announcementData.genreIds && announcementData.genreIds.length > 0) {
        await opportunityRepository.attachGenres(announcement.id, announcementData.genreIds);
      }

      if (announcementData.links && announcementData.links.length > 0) {
        await opportunityRepository.attachLinks(announcement.id, announcementData.links);
      }

      const fullAnnouncement = await opportunityRepository.findById(announcement.id);

      return reply.code(201).send({
        success: true,
        data: this.transformAnnouncement(fullAnnouncement),
      });
    } catch (err) {
      request.log.error('Failed to create announcement:', err);
      return reply.code(500).send({
        success: false,
        error: {
          code: 'CREATE_FAILED',
          message: 'Failed to create announcement',
        },
      });
    }
  }

  async getMyAnnouncements(request, reply) {
    const { userId } = request.authenticatedUser;

    try {
      const announcements = await opportunityRepository.findByUserId(userId);

      return reply.code(200).send({
        success: true,
        data: {
          announcements: announcements.map(a => this.transformBasicAnnouncement(a)),
        },
      });
    } catch (err) {
      request.log.error('Failed to fetch announcements:', err);
      return reply.code(500).send({
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: 'Failed to fetch announcements',
        },
      });
    }
  }

  async getAnnouncementById(request, reply) {
    const { announcementId } = request.params;
    const currentUserId = request.authenticatedUser?.userId;

    try {
      const announcement = await opportunityRepository.findById(announcementId);

      if (!announcement) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'ANNOUNCEMENT_NOT_FOUND',
            message: 'Announcement not found',
          },
        });
      }

      if (currentUserId && currentUserId !== announcement.user_id) {
        await opportunityRepository.incrementViews(announcementId);
      }

      return reply.code(200).send({
        success: true,
        data: this.transformAnnouncement(announcement),
      });
    } catch (err) {
      request.log.error('Failed to fetch announcement:', err);
      return reply.code(500).send({
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: 'Failed to fetch announcement',
        },
      });
    }
  }

  async searchAnnouncements(request, reply) {
    const {
      instrumentId,
      genreId,
      city,
      isRemote,
      isCoverBand,
      searchTerm,
      page = 1,
      pageSize = 20,
    } = request.query;

    try {
      const filters = {
        instrumentId,
        genreId,
        city,
        isRemote: isRemote !== undefined ? isRemote === 'true' : undefined,
        isCoverBand: isCoverBand !== undefined ? isCoverBand === 'true' : undefined,
        searchTerm,
      };

      const pagination = {
        page: parseInt(page),
        pageSize: Math.min(parseInt(pageSize), 100),
      };

      const announcements = await opportunityRepository.searchAnnouncements(filters, pagination);

      return reply.code(200).send({
        success: true,
        data: {
          announcements: announcements.map(a => this.transformBasicAnnouncement(a)),
          pagination: {
            page: pagination.page,
            pageSize: pagination.pageSize,
            hasMore: announcements.length === pagination.pageSize,
          },
        },
      });
    } catch (err) {
      request.log.error('Failed to search announcements:', err);
      return reply.code(500).send({
        success: false,
        error: {
          code: 'SEARCH_FAILED',
          message: 'Failed to search announcements',
        },
      });
    }
  }

  async updateAnnouncement(request, reply) {
    const { userId } = request.authenticatedUser;
    const { announcementId } = request.params;
    const updateData = request.body;

    const validations = InputValidator.gatherValidationErrors(
      InputValidator.validateLength(updateData.title, 5, 255, 'Title'),
      InputValidator.validateLength(updateData.description, 20, 5000, 'Description'),
      InputValidator.validateUrl(updateData.pictureUrl),
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
      const updated = await opportunityRepository.updateAnnouncement(
        announcementId,
        userId,
        updateData
      );

      if (!updated) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'ANNOUNCEMENT_NOT_FOUND',
            message: 'Announcement not found or you do not have permission to update it',
          },
        });
      }

      if (updateData.instrumentIds !== undefined) {
        await opportunityRepository.attachInstruments(announcementId, updateData.instrumentIds);
      }

      if (updateData.genreIds !== undefined) {
        await opportunityRepository.attachGenres(announcementId, updateData.genreIds);
      }

      if (updateData.links !== undefined) {
        await opportunityRepository.attachLinks(announcementId, updateData.links);
      }

      const fullAnnouncement = await opportunityRepository.findById(announcementId);

      return reply.code(200).send({
        success: true,
        data: this.transformAnnouncement(fullAnnouncement),
      });
    } catch (err) {
      request.log.error('Failed to update announcement:', err);
      return reply.code(500).send({
        success: false,
        error: {
          code: 'UPDATE_FAILED',
          message: 'Failed to update announcement',
        },
      });
    }
  }

  async deleteAnnouncement(request, reply) {
    const { userId } = request.authenticatedUser;
    const { announcementId } = request.params;

    try {
      const result = await opportunityRepository.deleteAnnouncement(announcementId, userId);

      if (!result) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'ANNOUNCEMENT_NOT_FOUND',
            message: 'Announcement not found or you do not have permission to delete it',
          },
        });
      }

      return reply.code(200).send({
        success: true,
        data: {
          message: 'Announcement deleted successfully',
        },
      });
    } catch (err) {
      request.log.error('Failed to delete announcement:', err);
      return reply.code(500).send({
        success: false,
        error: {
          code: 'DELETE_FAILED',
          message: 'Failed to delete announcement',
        },
      });
    }
  }

  async reactToAnnouncement(request, reply) {
    const { userId } = request.authenticatedUser;
    const { announcementId } = request.params;
    const { reactionType } = request.body;

    const validation = InputValidator.validateEnum(
      reactionType,
      ['like', 'dislike'],
      'Reaction type'
    );

    if (!validation.valid) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: validation.message,
        },
      });
    }

    try {
      const announcement = await opportunityRepository.findById(announcementId);

      if (!announcement) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'ANNOUNCEMENT_NOT_FOUND',
            message: 'Announcement not found',
          },
        });
      }

      await opportunityRepository.recordReaction(announcementId, userId, reactionType);

      return reply.code(200).send({
        success: true,
        data: {
          message: 'Reaction recorded',
          reactionType,
        },
      });
    } catch (err) {
      request.log.error('Failed to record reaction:', err);
      return reply.code(500).send({
        success: false,
        error: {
          code: 'REACTION_FAILED',
          message: 'Failed to record reaction',
        },
      });
    }
  }

  async saveAnnouncement(request, reply) {
    const { userId } = request.authenticatedUser;
    const { announcementId } = request.params;

    try {
      const announcement = await opportunityRepository.findById(announcementId);

      if (!announcement) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'ANNOUNCEMENT_NOT_FOUND',
            message: 'Announcement not found',
          },
        });
      }

      await opportunityRepository.saveAnnouncement(announcementId, userId);

      return reply.code(200).send({
        success: true,
        data: {
          message: 'Announcement saved',
        },
      });
    } catch (err) {
      request.log.error('Failed to save announcement:', err);
      return reply.code(500).send({
        success: false,
        error: {
          code: 'SAVE_FAILED',
          message: 'Failed to save announcement',
        },
      });
    }
  }

  async unsaveAnnouncement(request, reply) {
    const { userId } = request.authenticatedUser;
    const { announcementId } = request.params;

    try {
      const result = await opportunityRepository.unsaveAnnouncement(announcementId, userId);

      if (!result) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'SAVE_NOT_FOUND',
            message: 'Saved announcement not found',
          },
        });
      }

      return reply.code(200).send({
        success: true,
        data: {
          message: 'Announcement unsaved',
        },
      });
    } catch (err) {
      request.log.error('Failed to unsave announcement:', err);
      return reply.code(500).send({
        success: false,
        error: {
          code: 'UNSAVE_FAILED',
          message: 'Failed to unsave announcement',
        },
      });
    }
  }

  async getSavedAnnouncements(request, reply) {
    const { userId } = request.authenticatedUser;
    const { page = 1, pageSize = 20 } = request.query;

    try {
      const pagination = {
        page: parseInt(page),
        pageSize: Math.min(parseInt(pageSize), 100),
      };

      const announcements = await opportunityRepository.getSavedAnnouncements(userId, pagination);

      return reply.code(200).send({
        success: true,
        data: {
          announcements: announcements.map(a => this.transformBasicAnnouncement(a)),
          pagination: {
            page: pagination.page,
            pageSize: pagination.pageSize,
            hasMore: announcements.length === pagination.pageSize,
          },
        },
      });
    } catch (err) {
      request.log.error('Failed to fetch saved announcements:', err);
      return reply.code(500).send({
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: 'Failed to fetch saved announcements',
        },
      });
    }
  }

  transformAnnouncement(announcement) {
    return {
      id: announcement.id,
      userId: announcement.user_id,
      creatorEmail: announcement.creator_email,
      title: announcement.title,
      description: announcement.description,
      pictureUrl: announcement.picture_url,
      location: {
        city: announcement.city,
        state: announcement.state,
        country: announcement.country,
        coordinates: announcement.latitude && announcement.longitude ? {
          latitude: parseFloat(announcement.latitude),
          longitude: parseFloat(announcement.longitude),
        } : null,
      },
      isRemote: announcement.is_remote,
      isCoverBand: announcement.is_cover_band,
      instruments: announcement.instruments || [],
      genres: announcement.genres || [],
      links: announcement.links || [],
      stats: {
        views: announcement.views_count,
        likes: announcement.likes_count,
        dislikes: announcement.dislikes_count,
      },
      expiresAt: announcement.expires_at,
      isPublished: announcement.is_published,
      createdAt: announcement.created_at,
      updatedAt: announcement.updated_at,
    };
  }

  transformBasicAnnouncement(announcement) {
    return {
      id: announcement.id,
      userId: announcement.user_id,
      title: announcement.title,
      description: announcement.description,
      pictureUrl: announcement.picture_url,
      city: announcement.city,
      state: announcement.state,
      country: announcement.country,
      isRemote: announcement.is_remote,
      isCoverBand: announcement.is_cover_band,
      stats: {
        views: announcement.views_count,
        likes: announcement.likes_count,
        dislikes: announcement.dislikes_count,
      },
      expiresAt: announcement.expires_at,
      createdAt: announcement.created_at,
    };
  }
}

export const opportunityConductor = new OpportunityConductor();
