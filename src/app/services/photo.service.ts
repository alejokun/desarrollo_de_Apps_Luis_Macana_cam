import { Injectable, signal } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource, type Photo } from '@capacitor/camera';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import type { UserPhoto } from '../models/photo.model';

const PHOTO_INDEX_KEY = 'cam-gallery-photos';

@Injectable({ providedIn: 'root' })
export class PhotoService {
  private readonly photosSignal = signal<UserPhoto[]>([]);
  private readonly cameraPermissionSignal = signal<'granted' | 'denied' | 'prompt' | 'prompt-with-rationale' | 'limited' | 'unknown'>('unknown');
  private initialized = false;
  private readonly ready = this.initialize();

  readonly photos = this.photosSignal.asReadonly();
  readonly cameraPermission = this.cameraPermissionSignal.asReadonly();

  private async initialize(): Promise<void> {
    try {
      const stored = await Preferences.get({ key: PHOTO_INDEX_KEY });
      if (stored.value) {
        const photos = JSON.parse(stored.value) as UserPhoto[];
        this.photosSignal.set(await Promise.all(photos.map((photo) => this.refreshWebPath(photo))));
      }
    } catch {
      this.photosSignal.set([]);
    }
    this.initialized = true;
    await this.checkCameraPermission();
  }

  async checkCameraPermission(): Promise<void> {
    try {
      const status = await Camera.checkPermissions();
      this.cameraPermissionSignal.set(status.camera);
    } catch {
      this.cameraPermissionSignal.set('unknown');
    }
  }

  async capturePhoto(highQuality: boolean): Promise<'added' | 'permission_denied' | 'cancelled' | 'error'> {
    await this.ready;
    if (Capacitor.isNativePlatform()) {
      const permission = await Camera.checkPermissions();
      this.cameraPermissionSignal.set(permission.camera);

      if (permission.camera !== 'granted') {
        const requested = await Camera.requestPermissions({ permissions: ['camera'] });
        this.cameraPermissionSignal.set(requested.camera);
        if (requested.camera !== 'granted') return 'permission_denied';
      }
    }

    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        quality: highQuality ? 92 : 65,
        width: highQuality ? 1920 : 1000,
        allowEditing: false,
        webUseInput: false,
      });
      await this.storePhoto(photo);
      return 'added';
    } catch (error) {
      if (this.isCancellation(error)) return 'cancelled';
      console.error('No se pudo capturar la foto:', error);
      return 'error';
    }
  }

  async choosePhoto(highQuality: boolean): Promise<'added' | 'cancelled' | 'error'> {
    await this.ready;
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Uri,
        source: CameraSource.Photos,
        quality: highQuality ? 92 : 65,
        width: highQuality ? 1920 : 1000,
        allowEditing: false,
        webUseInput: false,
      });
      await this.storePhoto(photo);
      return 'added';
    } catch (error) {
      if (this.isCancellation(error)) return 'cancelled';
      console.error('No se pudo seleccionar la imagen:', error);
      return 'error';
    }
  }

  async deletePhoto(filepath: string): Promise<void> {
    await this.ready;
    try {
      await Filesystem.deleteFile({ path: filepath, directory: Directory.Data });
    } catch (error) {
      console.warn('No se pudo borrar el archivo local:', error);
    }
    this.photosSignal.update((photos) => photos.filter((photo) => photo.filepath !== filepath));
    await this.persistIndex();
  }

  private async storePhoto(photo: Photo): Promise<void> {
    const filepath = `photos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${photo.format}`;
    let savedUri: string;

    if (Capacitor.isNativePlatform()) {
      if (!photo.path) throw new Error('La cámara no devolvió una ruta de archivo.');
      const copied = await Filesystem.copy({ from: photo.path, to: filepath, toDirectory: Directory.Data });
      savedUri = copied.uri;
    } else {
      if (!photo.webPath) throw new Error('La cámara web no devolvió una ruta de imagen.');
      const response = await fetch(photo.webPath);
      const image = await response.blob();
      const saved = await Filesystem.writeFile({ path: filepath, data: image, directory: Directory.Data });
      savedUri = saved.uri;
    }

    const entry: UserPhoto = {
      filepath,
      webPath: Capacitor.convertFileSrc(savedUri),
      format: photo.format,
      createdAt: Date.now(),
    };
    this.photosSignal.update((photos) => [entry, ...photos]);
    await this.persistIndex();
  }

  private async refreshWebPath(photo: UserPhoto): Promise<UserPhoto> {
    try {
      const { uri } = await Filesystem.getUri({ path: photo.filepath, directory: Directory.Data });
      return { ...photo, webPath: Capacitor.convertFileSrc(uri) };
    } catch {
      return photo;
    }
  }

  private async persistIndex(): Promise<void> {
    await Preferences.set({ key: PHOTO_INDEX_KEY, value: JSON.stringify(this.photosSignal()) });
  }

  private isCancellation(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    return message.includes('cancel') || message.includes('user cancelled');
  }
}