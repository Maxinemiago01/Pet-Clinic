import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Camera, CameraErrorCode } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { IonIcon, IonSpinner, Platform } from '@ionic/angular';
import { Pet, today } from '../../models';
import { PetService } from '../../services/pet.service';
import { ImageService } from '../../services/image.service';
import { errorMessage } from '../../services/errors';

@Component({
  selector: 'app-pet-form',
  standalone: true,
  imports: [FormsModule, RouterLink, IonIcon, IonSpinner],
  templateUrl: './pet-form.page.html',
  styleUrl: './pet-form.page.scss',
})
export class PetFormPage implements OnInit, OnDestroy {
  private readonly nativeCamera = Capacitor.isNativePlatform();
  readonly canTakePhoto: boolean;
  id = '';
  backLink = ['/app'];
  pet: Omit<Pet, 'id'> = {
    name: '',
    species: 'Dog',
    breed: '',
    sex: 'Unknown',
    birthday: '',
    weightKg: null,
    allergies: '',
    notes: '',
    imageUrl: '',
    imagePath: '',
    createdAt: '',
    updatedAt: '',
  };
  loading = false;
  saving = false;
  preparing = false;
  error = '';
  photoError = '';
  photo: Blob | null = null;
  previewUrl = '';
  today = today();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private pets: PetService,
    private images: ImageService,
    platform: Platform,
  ) {
    this.canTakePhoto = this.nativeCamera || platform.is('android') || platform.is('ios');
  }
  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get('id') || '';
    if (this.id) {
      this.backLink = ['/app/pets', this.id];
      void this.load();
    }
  }
  ngOnDestroy(): void {
    this.clearPreview();
  }

  async load(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      const { id, ...pet } = await this.pets.getPet(this.id);
      this.pet = pet;
    } catch (error) {
      this.error = errorMessage(error);
    } finally {
      this.loading = false;
    }
  }

  async choosePhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0);
    if (!file) return;
    this.preparing = true;
    this.photoError = '';
    try {
      await this.preparePhoto(file);
    } catch (error) {
      this.photoError = errorMessage(error);
    } finally {
      this.preparing = false;
      input.value = '';
    }
  }

  async takePhoto(cameraInput: HTMLInputElement): Promise<void> {
    if (this.saving || this.preparing) return;
    this.photoError = '';
    if (!this.nativeCamera) {
      cameraInput.click();
      return;
    }

    this.preparing = true;
    try {
      const { webPath } = await Camera.takePhoto({ targetWidth: 800, targetHeight: 800 });
      if (!webPath) throw new Error('The camera returned no photo.');
      const response = await fetch(webPath);
      if (!response.ok) throw new Error('The captured photo could not be opened.');
      const file = new File([await response.blob()], 'pet-photo.jpg', { type: 'image/jpeg' });
      await this.preparePhoto(file);
    } catch (error) {
      if ((error as { code?: string } | null)?.code !== CameraErrorCode.TakePhotoCancelled) {
        this.photoError = 'Couldn’t take a photo. Try again or tap Choose photo.';
      }
    } finally {
      this.preparing = false;
    }
  }

  removePhoto(): void {
    this.clearPreview();
    this.photo = null;
    this.pet.imageUrl = '';
    this.pet.imagePath = '';
  }

  private async preparePhoto(file: File): Promise<void> {
    const preparedPhoto = await this.images.prepare(file);
    this.clearPreview();
    this.photo = preparedPhoto;
    this.previewUrl = URL.createObjectURL(preparedPhoto);
  }

  private clearPreview(): void {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = '';
  }

  async save(form: NgForm): Promise<void> {
    if (form.invalid || this.saving || this.preparing) return;
    this.error = '';
    const petName = this.pet.name.trim();
    if (!petName) {
      this.error = 'Please enter your pet’s name.';
      return;
    }
    this.saving = true;
    try {
      if (this.photo) {
        this.pet.imagePath = await this.images.upload(this.photo);
        this.photo = null;
      }
      const now = new Date().toISOString();
      let weightKg: number | null = null;
      if (this.pet.weightKg != null) {
        weightKg = Number(this.pet.weightKg);
      }

      const petToSave = {
        ...this.pet,
        name: petName,
        breed: this.pet.breed.trim(),
        allergies: this.pet.allergies.trim(),
        notes: this.pet.notes.trim(),
        weightKg,
        createdAt: this.pet.createdAt || now,
        updatedAt: now,
      };
      const savedPet = await this.pets.savePet(petToSave, this.id || undefined);
      await this.router.navigate(['/app/pets', savedPet.id], { replaceUrl: true });
    } catch (error) {
      this.error = errorMessage(error);
    } finally {
      this.saving = false;
    }
  }
}
