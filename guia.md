# Guía Práctica de Laboratorio: Implementación de la Cámara en Ionic con Capacitor

Esta guía acompaña la sesión de desarrollo móvil híbrido. Su objetivo es explicar de forma progresiva la integración del hardware de la cámara utilizando Capacitor y Angular con componentes Standalone y Signals, finalizando con la resolución paso a paso del taller práctico.

## Índice de Contenidos

1. [Paso 1: Instalación y Sincronización de Dependencias](#paso-1-instalación-y-sincronización-de-dependencias)
2. [Paso 2: Habilitación de la Cámara en Navegador Web (main.ts)](#paso-2-habilitación-de-la-cámara-en-navegador-web-maints)
3. [Paso 3: Configuración de Seguridad y Permisos Nativos](#paso-3-configuración-de-seguridad-y-permisos-nativos)
4. [Paso 4: Definición del Modelo de Datos (photo.model.ts)](#paso-4-definición-del-modelo-de-datos-photomodelts)
5. [Paso 5: Lógica de Hardware en el Servicio (photo.service.ts)](#paso-5-lógica-de-hardware-en-el-servicio-photoservicets)
6. [Paso 6: Consumo en la Interfaz Gráfica (gallery.page.ts)](#paso-6-consumo-en-la-interfaz-gráfica-gallerypagets)
7. [Paso 7: Ejecución, Pruebas y Casos Borde](#paso-7-ejecución-pruebas-y-casos-borde)
8. [Paso 8: Resolución del Taller Práctico (Selector Dinámico y Calidad Adaptativa)](#paso-8-resolución-del-taller-práctico-selector-dinámico-y-calidad-adaptativa)

---

## Paso 1: Instalación y Sincronización de Dependencias

Para interactuar con la cámara del dispositivo móvil no se utilizan APIs directas del navegador (como `navigator.mediaDevices` puro), sino el plugin oficial de Capacitor, el cual invoca las APIs nativas de Android e iOS.

Ejecuta en la terminal de tu proyecto:

```bash
# 1. Instalar el plugin nativo de la cámara
npm install @capacitor/camera

# 2. Instalar los elementos de soporte para entorno web (PWA Elements)
npm install @ionic/pwa-elements

# 3. Sincronizar plugins con las carpetas nativas (android / ios)
npx cap sync
```

### ¿Por qué cada paquete?

- **@capacitor/camera**: Contiene el código TypeScript que se ejecuta en tu aplicación y las clases nativas (Java/Kotlin en Android, Swift/Obj-C en iOS) que abren la cámara o la galería.
- **@ionic/pwa-elements**: Cuando ejecutas `ionic serve` en tu computadora, la app corre dentro de un navegador de escritorio que no tiene Android Intent ni Cocoa Touch. Este paquete provee un componente modal con interfaz gráfica para capturar fotos con la cámara web o elegir un archivo del disco.
- **npx cap sync**: Copia las librerías nativas del plugin a los proyectos `android/` e `ios/`. Sin este paso, el código compilará en TypeScript pero fallará al compilar en Android Studio o Xcode con el error `Camera plugin not implemented`.

---

## Paso 2: Habilitación de la Cámara en Navegador Web (main.ts)

Para que `@ionic/pwa-elements` esté disponible globalmente antes de que se monte la aplicación, debemos registrar sus Custom Elements en el punto de entrada de la aplicación.

Abre el archivo `src/main.ts` y añade las siguientes líneas:

```typescript
import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';

// IMPORTACIÓN DE PWA ELEMENTS
import { defineCustomElements } from '@ionic/pwa-elements/loader';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';

// REGISTRO DE ELEMENTOS EN EL OBJETO WINDOW
defineCustomElements(window);

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules)),
  ],
});
```

### Explicación línea por línea:

- **`import { defineCustomElements } from '@ionic/pwa-elements/loader';`**: Importa el cargador dinámico de Web Components empaquetado por Ionic.
- **`defineCustomElements(window);`**: Registra etiquetas HTML personalizadas como `<pwa-camera-modal>` en el árbol global del navegador (`window.customElements`). Si omites esto, al presionar el botón de cámara en la PC aparecerá un error en la consola: `PWA Elements not installed.`

---

## Paso 3: Configuración de Seguridad y Permisos Nativos

Tanto Google como Apple exigen declarar explícitamente qué recursos de hardware utiliza la aplicación antes de permitir su ejecución.

### A. Android (`android/app/src/main/AndroidManifest.xml`)

Dentro de la etiqueta raíz `<manifest>`, agrega los permisos necesarios:

```xml
<!-- Permiso para activar el sensor físico de captura -->
<uses-permission android:name="android.permission.CAMERA" />

<!-- Para dispositivos con Android 12 (API 32) o menor -->
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"
    android:maxSdkVersion="32" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"
    android:maxSdkVersion="29" />

<!-- Para Android 13+ (API 33+) cuando se selecciona desde la galería multimedia -->
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
```

> **Nota técnica**: A partir de Android 13 (API 33), el permiso genérico `READ_EXTERNAL_STORAGE` quedó obsoleto y fue reemplazado por permisos granulares como `READ_MEDIA_IMAGES`.

### B. iOS (`ios/App/App/Info.plist`)

Dentro de la clave `<dict>` principal:

```xml
<key>NSCameraUsageDescription</key>
<string>Necesitamos acceso a la cámara para capturar fotografías de inspección.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>Necesitamos acceso a su biblioteca para adjuntar fotos existentes.</string>

<key>NSPhotoLibraryAddUsageDescription</key>
<string>Necesitamos permiso para guardar fotos tomadas en su carrete.</string>
```

> **Regla estricta de Apple**: Si intentas abrir la cámara en iOS sin que `NSCameraUsageDescription` esté presente, el sistema operativo cierra la app de inmediato (crash forzoso) por violación de privacidad de usuario.

---

## Paso 4: Definición del Modelo de Datos (photo.model.ts)

Crea el archivo `src/app/models/photo.model.ts` para tipar estrictamente las fotografías almacenadas en la aplicación:

```typescript
export interface UserPhoto {
  filepath: string;
  webPath?: string;
  format: string;
}
```

### Explicación de los campos:

- **filepath**: Identificador o nombre del archivo (por ejemplo, `1716304561234.jpeg`). Útil para persistencia en disco o almacenamiento local.
- **webPath**: La URL interna que utiliza la WebView para mostrar la imagen en pantalla. En un dispositivo real luce como `capacitor://localhost/_capacitor_file_/data/user/0/...`. Es opcional (`?`) porque si la foto se almacena offline sin cargar en memoria, podría recuperarse bajo demanda.
- **format**: Formato de compresión de la imagen devuelto por la cámara (`jpeg`, `png`, `webp`).

---

## Paso 5: Lógica de Hardware en el Servicio (photo.service.ts)

Siguiendo el principio de Responsabilidad Única (SRP), la vista nunca debe llamar a plugins nativos directamente. Centralizamos la lógica en un servicio inyectable.

Crea el archivo `src/app/services/photo.service.ts`:

```typescript
import { Injectable, signal } from '@angular/core';
import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera';
import { UserPhoto } from '../models/photo.model';

@Injectable({
  providedIn: 'root'
})
export class PhotoService {
  // 1. Estado reactivo privado mediante Angular Signals
  private photosSignal = signal<UserPhoto[]>([]);

  // 2. Exposición de solo lectura del estado para los componentes
  public readonly photos = this.photosSignal.asReadonly();

  // 3. Método principal para capturar fotografía
  async takeNewPhoto(): Promise<void> {
    try {
      // 4. Verificación y solicitud de permisos
      const permissionStatus = await Camera.checkPermissions();
      if (permissionStatus.camera !== 'granted') {
        const request = await Camera.requestPermissions({ permissions: ['camera'] });
        if (request.camera !== 'granted') {
          console.warn('El usuario denegó el acceso a la cámara.');
          return;
        }
      }

      // 5. Invocación de la cámara del sistema
      const capturedPhoto: Photo = await Camera.getPhoto({
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        quality: 85,
        allowEditing: false,
        width: 1280
      });

      // 6. Mapeo a nuestro modelo de dominio
      const newPhoto: UserPhoto = {
        filepath: `${Date.now()}.${capturedPhoto.format}`,
        webPath: capturedPhoto.webPath,
        format: capturedPhoto.format
      };

      // 7. Actualización inmutable del estado
      this.photosSignal.update(photos => [newPhoto, ...photos]);

    } catch (error: any) {
      // 8. Control de cancelación del usuario
      if (error?.message?.includes('cancelled') || error?.message?.includes('User cancelled')) {
        console.log('El usuario canceló la captura de imagen.');
        return;
      }
      console.error('Error no controlado al usar la cámara:', error);
      throw error;
    }
  }

  // 9. Método para eliminar una imagen del estado
  deletePhoto(index: number): void {
    this.photosSignal.update(photos => photos.filter((_, i) => i !== index));
  }
}
```

### Análisis detallado del código:

#### 1 y 2. Reactividad con Signals (`signal`, `asReadonly`)

```typescript
private photosSignal = signal<UserPhoto[]>([]);
public readonly photos = this.photosSignal.asReadonly();
```

- **`signal<UserPhoto[]>([])`**: Crea una señal reactiva con un arreglo vacío. Cuando la señal cambia, Angular sabe con precisión qué nodos del DOM deben actualizarse sin necesidad de reevaluar todo el árbol de componentes.
- **`asReadonly()`**: Impide que componentes externos modifiquen el arreglo directamente (por ejemplo, haciendo `photoService.photos.set(...)`). Solo el servicio tiene autoridad para mutar los datos.

#### 4. Verificación activa de permisos

```typescript
const permissionStatus = await Camera.checkPermissions();
```

- `Camera.checkPermissions()` retorna el estado actual (`prompt`, `granted`, `denied`).
- Si no está concedido (`camera !== 'granted'`), solicitamos el permiso explícitamente con `Camera.requestPermissions({ permissions: ['camera'] })`. Si el usuario rechaza el diálogo del sistema, detenemos la ejecución de manera controlada con `return;`.

#### 5. Configuración de captura (`Camera.getPhoto`)

```typescript
const capturedPhoto: Photo = await Camera.getPhoto({
  resultType: CameraResultType.Uri,
  source: CameraSource.Camera,
  quality: 85,
  allowEditing: false,
  width: 1280
});
```

- **`resultType: CameraResultType.Uri`**: La decisión de rendimiento más importante. En lugar de convertir la foto en un string en memoria (Base64), Capacitor guarda el archivo temporalmente en disco y devuelve una URI segura. Esto reduce drásticamente el consumo de memoria RAM.
- **`source: CameraSource.Camera`**: Abre directamente la app de cámara. Si quisiéramos permitir al usuario elegir entre cámara o carrete, usaríamos `CameraSource.Prompt`.
- **`quality: 85`**: Nivel de compresión JPEG del 1 al 100. Un valor de 85 reduce el peso del archivo hasta en un 60% sin pérdida visual perceptible en pantallas de alta densidad.
- **`allowEditing: false`**: Deshabilita el recorte nativo posterior a la toma (reduce pasos y previene comportamientos dispares entre fabricantes de Android).
- **`width: 1280`**: Escala la imagen proporcionalmente para que el ancho máximo no supere los 1280 píxeles. Esto evita cargar en la WebView fotos de 48 o 108 megapíxeles (que pesan más de 15 MB) y previene errores de falta de memoria (Out of Memory).

#### 7. Actualización inmutable

```typescript
this.photosSignal.update(photos => [newPhoto, ...photos]);
```

- Utilizamos el operador spread (`...photos`) para insertar la nueva foto en la primera posición del arreglo creando una nueva referencia. Esto garantiza que la detección de cambios funcione de manera predecible.

#### 8. Manejo de la cancelación del usuario

```typescript
if (error?.message?.includes('cancelled') || error?.message?.includes('User cancelled')) {
  return;
}
```

- Cuando el usuario abre la cámara y pulsa el botón "Atrás" sin tomar una foto, Capacitor rechaza la Promesa con un mensaje de error. Si no capturamos este caso específico, la consola marcará una excepción roja no controlada (Unhandled Promise Rejection).

---

## Paso 6: Consumo en la Interfaz Gráfica (gallery.page.ts)

Implementamos la página utilizando componentes independientes (Standalone Components) y la nueva sintaxis de plantillas de Angular (`@for`, `@empty`).

Abre o crea `src/app/gallery/gallery.page.ts`:

```typescript
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonGrid, IonRow, IonCol, IonImg, IonFab,
  IonFabButton, IonIcon, IonCard, IonButton
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { camera, trashOutline } from 'ionicons/icons';
import { PhotoService } from '../services/photo.service';

@Component({
  selector: 'app-gallery',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonGrid, IonRow, IonCol, IonImg, IonFab,
    IonFabButton, IonIcon, IonCard, IonButton
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>Galería de Evidencias</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-grid>
        <ion-row>
          <!-- Iteración reactiva sobre la señal del servicio -->
          @for (photo of photoService.photos(); track photo.filepath; let i = $index) {
            <ion-col size="12" size-md="6" size-lg="4">
              <ion-card>
                <!-- Renderizado optimizado con ion-img -->
                <ion-img [src]="photo.webPath" [alt]="photo.filepath"></ion-img>
                <div class="ion-padding">
                  <ion-button color="danger" fill="clear" expand="block"
                    (click)="photoService.deletePhoto(i)">
                    <ion-icon slot="start" name="trash-outline"></ion-icon>
                    Eliminar
                  </ion-button>
                </div>
              </ion-card>
            </ion-col>
          } @empty {
            <!-- Bloque mostrado cuando no hay fotografías -->
            <ion-col size="12" class="ion-text-center">
              <p style="color: #64748b; margin-top: 40px;">
                No hay evidencias capturadas.<br>Presione el botón de la cámara para iniciar.
              </p>
            </ion-col>
          }
        </ion-row>
      </ion-grid>

      <!-- Botón Flotante de Acción (FAB) -->
      <ion-fab vertical="bottom" horizontal="center" slot="fixed">
        <ion-fab-button (click)="takePhoto()">
          <ion-icon name="camera"></ion-icon>
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  `
})
export class GalleryPage {
  // Inyección de dependencias funcional moderna
  public photoService = inject(PhotoService);

  constructor() {
    // Registro explícito de iconos para optimizar el bundle (tree-shaking)
    addIcons({ camera, trashOutline });
  }

  async takePhoto() {
    await this.photoService.takeNewPhoto();
  }
}
```

### Explicación de la vista y del componente:

- **`inject(PhotoService)`**: Inyección funcional de dependencias de Angular (alternativa moderna al constructor tradicional).
- **`addIcons({ camera, trashOutline })`**: En Ionic Standalone, los iconos no se cargan todos juntos; se registran solo los necesarios para reducir el tamaño final de la app.
- **`photoService.photos()`**: Nótese los paréntesis `()`. Al ser un Signal, se invoca como una función de lectura para suscribirse a los cambios de manera reactiva.
- **`@for (... ; track photo.filepath)`**: Directiva moderna de flujo de control. El parámetro `track` le indica a Angular cómo identificar de forma unívoca cada elemento para no redibujar toda la lista al agregar o quitar elementos.
- **`ion-img [src]="photo.webPath"`**: El componente `ion-img` incluye carga perezosa (lazy loading) nativa y maneja correctamente los protocolos de archivo de Capacitor (`capacitor://` en iOS, `http://localhost` en Android).
- **`ion-fab slot="fixed"`**: Un botón flotante fijo en la parte inferior central de la pantalla, accesible ergonómicamente con una sola mano en dispositivos móviles.

---

## Paso 7: Ejecución, Pruebas y Casos Borde

### 1. Prueba en el navegador

```bash
ionic serve
```

- Se abrirá la aplicación en tu navegador.
- Al hacer clic en el botón de cámara, aparecerá el modal de `@ionic/pwa-elements` solicitando acceso a tu webcam o permitiéndote subir una foto desde tu disco.

### 2. Prueba en dispositivo físico o emulador Android

```bash
# Compilar código web y sincronizar con Android
ionic cap run android -l --external
```

- El flag `-l` habilita Live Reload (la app se actualiza en el teléfono con cada cambio de código sin recompilar el APK).
- Se abrirá Android Studio. Conecta un dispositivo por depuración USB o inicia un emulador con cámara virtual habilitada.

### 3. Preguntas frecuentes y solución de problemas comunes

| Problema / Síntoma | Causa raíz | Solución |
|---|---|---|
| Error: PWA Elements not installed | Falta registrar PWA Elements en el navegador. | Verifica que `defineCustomElements(window)` esté ejecutándose en `src/main.ts`. |
| Pantalla negra o cierre repentino en iOS | Falta la clave de permiso en `Info.plist`. | Agrega `NSCameraUsageDescription` con un texto descriptivo válido. |
| Excepción al pulsar atrás en la cámara | Rechazo de la Promesa por cancelación del usuario. | Envuelve la llamada `Camera.getPhoto` en `try/catch` ignorando el mensaje `User cancelled`. |
| La foto no aparece en Android real | Uso indebido de `CameraResultType.Base64` con imágenes muy grandes. | Cambia a `CameraResultType.Uri` y usa la propiedad `webPath`. |

---

## Paso 8: Resolución del Taller Práctico (Selector Dinámico y Calidad Adaptativa)

En este bloque abordaremos los tres requerimientos planteados para el ejercicio autónomo:

1. Configuración de `CameraSource.Prompt` y parámetro `highDefinition: boolean` en `PhotoService`.
2. Interfaz con selector dinámico mediante `ion-toggle`.
3. Notificación con `ion-toast` mediante `ToastController` en caso de denegación de permisos.

### 8.1. Actualización de PhotoService (`src/app/services/photo.service.ts`)

Modificamos el servicio para que reciba un parámetro booleano y retorne un indicador de éxito o fracaso por permisos:

```typescript
import { Injectable, signal } from '@angular/core';
import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera';
import { UserPhoto } from '../models/photo.model';

@Injectable({
  providedIn: 'root'
})
export class PhotoService {
  private photosSignal = signal<UserPhoto[]>([]);
  public readonly photos = this.photosSignal.asReadonly();

  /**
   * Captura una foto permitiendo al usuario elegir origen y calidad.
   * @param isHighDef Define si la imagen se procesa en alta calidad o ahorro de datos.
   * @returns boolean true si la foto fue tomada, false si hubo error o permiso denegado.
   */
  async takeNewPhoto(isHighDef: boolean): Promise<{ success: boolean; reason?: 'permission_denied' | 'cancelled' | 'error' }> {
    try {
      // 1. Verificación y solicitud de permisos para cámara y fotos
      const checkStatus = await Camera.checkPermissions();
      if (checkStatus.camera !== 'granted' || checkStatus.photos !== 'granted') {
        const request = await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
        if (request.camera !== 'granted' && request.photos !== 'granted') {
          console.warn('Permisos de cámara o galería no concedidos.');
          return { success: false, reason: 'permission_denied' };
        }
      }

      // 2. Parámetros dinámicos según el modo seleccionado
      const imageQuality = isHighDef ? 95 : 60;
      const targetWidth = isHighDef ? 1920 : 800;

      // 3. Captura con CameraSource.Prompt (Diálogo nativo: Cámara o Carrete)
      const capturedPhoto: Photo = await Camera.getPhoto({
        resultType: CameraResultType.Uri,
        source: CameraSource.Prompt, // Permite al usuario elegir entre cámara o galería
        quality: imageQuality,
        width: targetWidth,
        allowEditing: false,
        promptLabelHeader: 'Seleccionar Origen',
        promptLabelPhoto: 'Elegir de la Galería',
        promptLabelPicture: 'Tomar Fotografía'
      });

      // 4. Mapeo y actualización inmutable
      const newPhoto: UserPhoto = {
        filepath: `${Date.now()}.${capturedPhoto.format}`,
        webPath: capturedPhoto.webPath,
        format: capturedPhoto.format
      };

      this.photosSignal.update(photos => [newPhoto, ...photos]);
      return { success: true };

    } catch (error: any) {
      if (error?.message?.includes('cancelled') || error?.message?.includes('User cancelled')) {
        return { success: false, reason: 'cancelled' };
      }
      console.error('Error durante la captura:', error);
      return { success: false, reason: 'error' };
    }
  }

  deletePhoto(index: number): void {
    this.photosSignal.update(photos => photos.filter((_, i) => i !== index));
  }
}
```

### Análisis de las mejoras:

- **`CameraSource.Prompt`**: Despliega un menú emergente nativo tipo Action Sheet donde el usuario decide si toma una foto en vivo o adjunta una imagen ya guardada en el dispositivo.
- **`isHighDef ? 95 : 60` y `isHighDef ? 1920 : 800`**: En modo ahorro de datos, la resolución baja a 800px y la compresión al 60%, reduciendo el peso de la imagen de aproximadamente ~2.5 MB a menos de ~200 KB, ideal para redes móviles inestables o conexiones de campo.
- **`return { success: false, reason: 'permission_denied' }`**: En lugar de mostrar la interfaz de alerta dentro del servicio (violando la separación de capas), el servicio retorna el motivo del fallo para que el componente de la vista decida cómo notificar al usuario.

### 8.2. Actualización de la Vista (`src/app/gallery/gallery.page.ts`)

Integramos `IonToggle`, `ToastController`, y el estado reactivo del componente para controlar el modo de calidad:

```typescript
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonGrid, IonRow, IonCol, IonImg, IonFab,
  IonFabButton, IonIcon, IonCard, IonButton,
  IonItem, IonLabel, IonToggle, ToastController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { camera, trashOutline, sparkles, flashOffOutline } from 'ionicons/icons';
import { PhotoService } from '../services/photo.service';

@Component({
  selector: 'app-gallery',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonGrid, IonRow, IonCol, IonImg, IonFab,
    IonFabButton, IonIcon, IonCard, IonButton,
    IonItem, IonLabel, IonToggle
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>Bitácora de Evidencias</ion-title>
      </ion-toolbar>

      <!-- Barra de configuración de calidad -->
      <ion-toolbar color="light">
        <ion-item lines="none">
          <ion-icon [name]="isHighDef() ? 'sparkles' : 'flash-off-outline'" slot="start"
            color="primary"></ion-icon>
          <ion-label>
            <h3>{{ isHighDef() ? 'Modo Alta Definición (1080p)' : 'Modo Ahorro de Datos (800px)' }}</h3>
            <p>{{ isHighDef() ? 'Calidad 95% • Mayor detalle' : 'Calidad 60% • Carga rápida' }}</p>
          </ion-label>
          <ion-toggle
            [checked]="isHighDef()"
            (ionChange)="toggleQuality($event.detail.checked)">
          </ion-toggle>
        </ion-item>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-grid>
        <ion-row>
          @for (photo of photoService.photos(); track photo.filepath; let i = $index) {
            <ion-col size="12" size-md="6" size-lg="4">
              <ion-card>
                <ion-img [src]="photo.webPath" [alt]="photo.filepath"></ion-img>
                <div class="ion-padding">
                  <ion-button color="danger" fill="clear" expand="block"
                    (click)="photoService.deletePhoto(i)">
                    <ion-icon slot="start" name="trash-outline"></ion-icon>
                    Eliminar
                  </ion-button>
                </div>
              </ion-card>
            </ion-col>
          } @empty {
            <ion-col size="12" class="ion-text-center">
              <div style="margin-top: 60px; color: #64748b;">
                <ion-icon name="camera" style="font-size: 48px; margin-bottom: 12px;"></ion-icon>
                <p>No hay fotografías registradas.<br>Presione el botón inferior para comenzar.</p>
              </div>
            </ion-col>
          }
        </ion-row>
      </ion-grid>

      <!-- Botón Flotante para Capturar -->
      <ion-fab vertical="bottom" horizontal="center" slot="fixed">
        <ion-fab-button (click)="takePhoto()">
          <ion-icon name="camera"></ion-icon>
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  `
})
export class GalleryPage {
  public photoService = inject(PhotoService);
  private toastController = inject(ToastController);

  // Señal local para el estado del interruptor de calidad
  public isHighDef = signal<boolean>(false);

  constructor() {
    addIcons({ camera, trashOutline, sparkles, flashOffOutline });
  }

  toggleQuality(enabled: boolean): void {
    this.isHighDef.set(enabled);
  }

  async takePhoto(): Promise<void> {
    const result = await this.photoService.takeNewPhoto(this.isHighDef());

    if (!result.success && result.reason === 'permission_denied') {
      await this.showPermissionWarningToast();
    }
  }

  private async showPermissionWarningToast(): Promise<void> {
    const toast = await this.toastController.create({
      message: 'Permiso denegado. Conceda acceso a la cámara y galería en los ajustes del dispositivo.',
      duration: 3500,
      position: 'bottom',
      color: 'danger',
      buttons: [
        {
          text: 'Entendido',
          role: 'cancel'
        }
      ]
    });
    await toast.present();
  }
}
```

### 8.3. Desglose pedagógico de la solución

1. **Cumplimiento de Arquitectura Limpia**:
   - La vista (`GalleryPage`) es responsable exclusiva de los elementos visuales (`ion-toggle`, `ToastController`, iconos).
   - El servicio (`PhotoService`) desconoce la existencia de componentes gráficos; solo procesa parámetros y devuelve promesas tipadas.

2. **Doble verificación de permisos (`camera` y `photos`)**:
   - Al utilizar `CameraSource.Prompt`, el usuario puede elegir abrir la galería. Por ello, en el paso de permisos validamos tanto `checkStatus.camera` como `checkStatus.photos`.

3. **Uso de `ToastController`**:
   - Proporciona retroalimentación visual no invasiva cuando el usuario revoca o deniega los permisos en el sistema operativo, guiándolo a los ajustes sin provocar caídas de la aplicación.