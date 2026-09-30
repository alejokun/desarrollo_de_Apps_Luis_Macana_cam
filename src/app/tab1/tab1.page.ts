import { Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { App } from '@capacitor/app';
import { addIcons } from 'ionicons';
import { camera, imageOutline, imagesOutline, trashOutline, shieldCheckmarkOutline, shieldOutline, sparkles, flashOutline } from 'ionicons/icons';
import {
  IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonImg, IonLabel,
  IonSegment, IonSegmentButton, IonSpinner, IonTitle, IonToast, IonToggle, IonToolbar,
} from '@ionic/angular';
import { PhotoService } from '../services/photo.service';

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  imports: [
    DatePipe, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonImg,
    IonLabel, IonSegment, IonSegmentButton, IonSpinner, IonTitle, IonToast,
    IonToggle, IonToolbar,
  ],
})
export class Tab1Page {
  readonly photoService = inject(PhotoService);
  private readonly destroyRef = inject(DestroyRef);
  readonly source = signal<'camera' | 'gallery'>('camera');
  readonly highQuality = signal(false);
  readonly busy = signal(false);
  readonly toastMessage = signal('');
  readonly toastOpen = signal(false);

  constructor() {
    addIcons({ camera, imageOutline, imagesOutline, trashOutline, shieldCheckmarkOutline, shieldOutline, sparkles, flashOutline });
    void this.photoService.checkCameraPermission();
    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void this.photoService.checkCameraPermission();
    }).then((listener) => {
      if (this.destroyRef.destroyed) void listener.remove();
      else this.destroyRef.onDestroy(() => void listener.remove());
    }).catch(() => undefined);
  }

  async addPhoto(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const result = this.source() === 'camera'
        ? await this.photoService.capturePhoto(this.highQuality())
        : await this.photoService.choosePhoto(this.highQuality());
      if (result === 'added') this.notify('Imagen guardada en tu galería.');
      if (result === 'permission_denied') this.notify('Activa el permiso de cámara en los ajustes de Android.');
      if (result === 'error') this.notify('No se pudo abrir la imagen. Inténtalo de nuevo.');
    } finally {
      this.busy.set(false);
    }
  }

  async deletePhoto(filepath: string): Promise<void> {
    await this.photoService.deletePhoto(filepath);
    this.notify('Imagen eliminada.');
  }

  private notify(message: string): void {
    this.toastMessage.set(message);
    this.toastOpen.set(true);
  }
}
