import { opportunityRepository } from '../repositories/opportunity-repository.js';
import { realmConnector } from '../repositories/realm-connector.js';
import { InputValidator } from '../validators/input-validator.js';

export class OpportunityConductor {
  async createAnnouncement(request, reply) {
    const { userId } = request.authenticatedUser;
    const announcementData = request.body ?? {};

    const validations = InputValidator.gatherValidationErrors(
      InputValidator.validateRequired(announcementData.title, 'Title'),
      InputValidator.validateLength(announcementData.title, 5, 255, 'Title'),
      InputValidator.validateRequired(announcementData.description, 'Description'),
      InputValidator.validateLength(announcementData.description, 20, 5000, 'Description'),
      InputValidator.validateUrl(announcementData.pictureUrl),
      InputValidator.validateCoordinates(announcementData.latitude, announcementData.longitude),
      InputValidator.validateBoolean(announcementData.isRemote, 'Remote'),
      InputValidator.validateBoolean(announcementData.isCoverBand, 'Cover band'),
      InputValidator.validateBoolean(announcementData.isPublished, 'Published'),
      InputValidator.validateUuidArray(announcementData.instrumentIds, 'Instrument IDs'),
      InputValidator.validateUuidArray(announcementData.genreIds, 'Genre IDs'),
      InputValidator.validateLinks(announcementData.links),
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
      const fullAnnouncement = await realmConnector.transaction(async (executor) => {
        const announcement = await opportunityRepository.createAnnouncement(
          userId,
          announcementData,
          executor,
        );
        await opportunityRepository.attachInstruments(
          announcement.id,
          announcementData.instrumentIds || [],
          executor,
        );
        await opportunityRepository.attachGenres(
          announcement.id,
          announcementData.genreIds || [],
          executor,
        );
        await opportunityRepository.attachLinks(
          announcement.id,
          announcementData.links || [],
          executor,
        );
        return opportunityRepository.findById(announcement.id, executor);
      });

      return reply.code(201).send({
        success: true,
        data: this.transformAnnouncement(fullAnnouncement),
      });
    } catch (err) {
      request.log.error({ err }, 'Failed to create announcement');
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
      request.log.error({ err }, 'Failed to fetch announcements');
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
      request.log.error({ err }, 'Failed to fetch announcement');
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

    const paginationResult = InputValidator.parsePagination(page, pageSize);
    const remoteResult = InputValidator.parseOptionalBoolean(isRemote, 'Remote');
    const coverBandResult = InputValidator.parseOptionalBoolean(isCoverBand, 'Cover band');
    const queryValidation = InputValidator.gatherValidationErrors(
      paginationResult,
      remoteResult,
      coverBandResult,
      InputValidator.validateUuid(instrumentId, 'Instrument ID'),
      InputValidator.validateUuid(genreId, 'Genre ID'),
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
      const filters = {
        instrumentId,
        genreId,
        city,
        isRemote: remoteResult.value,
        isCoverBand: coverBandResult.value,
        searchTerm,
      };

      const pagination = paginationResult.pagination;
      const announcements = await opportunityRepository.searchAnnouncements(filters, {
        ...pagination,
        limit: pagination.pageSize + 1,
      });
      const hasMore = announcements.length > pagination.pageSize;

      return reply.code(200).send({
        success: true,
        data: {
          announcements: announcements
            .slice(0, pagination.pageSize)
            .map(a => this.transformBasicAnnouncement(a)),
          pagination: {
            page: pagination.page,
            pageSize: pagination.pageSize,
            hasMore,
          },
        },
      });
    } catch (err) {
      request.log.error({ err }, 'Failed to search announcements');
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
    const updateData = request.body ?? {};

    const validations = InputValidator.gatherValidationErrors(
      InputValidator.validateLength(updateData.title, 5, 255, 'Title'),
      InputValidator.validateLength(updateData.description, 20, 5000, 'Description'),
      InputValidator.validateUrl(updateData.pictureUrl),
      InputValidator.validateCoordinates(updateData.latitude, updateData.longitude),
      InputValidator.validateBoolean(updateData.isRemote, 'Remote'),
      InputValidator.validateBoolean(updateData.isCoverBand, 'Cover band'),
      InputValidator.validateBoolean(updateData.isPublished, 'Published'),
      InputValidator.validateUuidArray(updateData.instrumentIds, 'Instrument IDs'),
      InputValidator.validateUuidArray(updateData.genreIds, 'Genre IDs'),
      InputValidator.validateLinks(updateData.links),
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
      const fullAnnouncement = await realmConnector.transaction(async (executor) => {
        const updated = await opportunityRepository.updateAnnouncement(
          announcementId,
          userId,
          updateData,
          executor,
        );

        if (!updated) {
          return null;
        }

        if (updateData.instrumentIds !== undefined) {
          await opportunityRepository.attachInstruments(
            announcementId,
            updateData.instrumentIds,
            executor,
          );
        }

        if (updateData.genreIds !== undefined) {
          await opportunityRepository.attachGenres(announcementId, updateData.genreIds, executor);
        }

        if (updateData.links !== undefined) {
          await opportunityRepository.attachLinks(announcementId, updateData.links, executor);
        }

        return opportunityRepository.findById(announcementId, executor);
      });

      if (!fullAnnouncement) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'ANNOUNCEMENT_NOT_FOUND',
            message: 'Announcement not found or you do not have permission to update it',
          },
        });
      }

      return reply.code(200).send({
        success: true,
        data: this.transformAnnouncement(fullAnnouncement),
      });
    } catch (err) {
      request.log.error({ err }, 'Failed to update announcement');
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
      request.log.error({ err }, 'Failed to delete announcement');
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
    const { reactionType } = request.body ?? {};

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

      await realmConnector.transaction((executor) => opportunityRepository.recordReaction(
        announcementId,
        userId,
        reactionType,
        executor,
      ));

      return reply.code(200).send({
        success: true,
        data: {
          message: 'Reaction recorded',
          reactionType,
        },
      });
    } catch (err) {
      request.log.error({ err }, 'Failed to record reaction');
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
      request.log.error({ err }, 'Failed to save announcement');
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
      request.log.error({ err }, 'Failed to unsave announcement');
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

    const paginationResult = InputValidator.parsePagination(page, pageSize);
    if (!paginationResult.valid) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: paginationResult.message,
        },
      });
    }

    try {
      const pagination = paginationResult.pagination;
      const announcements = await opportunityRepository.getSavedAnnouncements(userId, {
        ...pagination,
        limit: pagination.pageSize + 1,
      });
      const hasMore = announcements.length > pagination.pageSize;

      return reply.code(200).send({
        success: true,
        data: {
          announcements: announcements
            .slice(0, pagination.pageSize)
            .map(a => this.transformBasicAnnouncement(a)),
          pagination: {
            page: pagination.page,
            pageSize: pagination.pageSize,
            hasMore,
          },
        },
      });
    } catch (err) {
      request.log.error({ err }, 'Failed to fetch saved announcements');
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
      location: {
        city: announcement.city,
        state: announcement.state,
        country: announcement.country,
      },
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
