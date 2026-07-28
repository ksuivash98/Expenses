/**
 * services/StorageService.js
 * Работа с Supabase Storage (аватары) + синхронизация файлов.
 */

import { authService } from './AuthService.js';
import { generateId } from '../helpers/utils.js';

const BUCKET = 'avatars';

/**
 * Сервис файлового хранилища.
 */
export class StorageService {
  /**
   * Загружает аватар пользователя.
   * @param {string} userId
   * @param {File} file
   * @returns {Promise<{ success: boolean, url?: string, message?: string }>}
   */
  async uploadAvatar(userId, file) {
    if (!authService.isConfigured()) {
      return { success: false, message: 'Supabase не настроен' };
    }
    if (!file) return { success: false, message: 'Файл не выбран' };

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${userId}/${generateId()}.${ext}`;
    const client = authService.getClient();

    const { error } = await client.storage.from(BUCKET).upload(path, file, {
      upsert: true,
      contentType: file.type || 'image/jpeg'
    });

    if (error) {
      return { success: false, message: error.message };
    }

    const { data } = client.storage.from(BUCKET).getPublicUrl(path);
    return { success: true, url: data.publicUrl, path };
  }

  /**
   * Удаляет файл аватара по URL/пути.
   * @param {string} userId
   * @param {string} avatarUrl
   */
  async removeAvatar(userId, avatarUrl) {
    if (!authService.isConfigured() || !avatarUrl) {
      return { success: true };
    }

    try {
      const marker = `/object/public/${BUCKET}/`;
      const idx = avatarUrl.indexOf(marker);
      if (idx === -1) return { success: true };
      const path = avatarUrl.slice(idx + marker.length);
      const { error } = await authService.getClient().storage.from(BUCKET).remove([path]);
      if (error) return { success: false, message: error.message };
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}

export const storageService = new StorageService();
export default storageService;
