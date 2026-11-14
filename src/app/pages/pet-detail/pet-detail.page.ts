import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { Pet, PetRecord, petAge, recordLabels, today } from '../../models';
import { PetService } from '../../services/pet.service';
import { errorMessage } from '../../services/errors';

@Component({
  selector: 'app-pet-detail',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, IonIcon, IonSpinner],
  templateUrl: './pet-detail.page.html',
  styleUrl: './pet-detail.page.scss',
})
export class PetDetailPage implements OnInit {
  @ViewChild('recordDialog') recordDialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('deleteDialog') deleteDialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('recordForm') recordForm!: NgForm;
  pet: Pet | null = null;
  records: PetRecord[] = [];
  loading = true;
  error = '';
  labels = recordLabels;
  petAge = petAge;
  today = today();
  record = this.blankRecord();
  editingRecordId = '';
  private originalNextDate = '';
  recordError = '';
  saving = false;
  deleting = false;
  deleteRecordTarget: PetRecord | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private pets: PetService,
  ) {}
  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      const petId = this.route.snapshot.paramMap.get('id');
      if (!petId) {
        this.error = 'This pet profile could not be found.';
        return;
      }

      const [pet, records] = await Promise.all([
        this.pets.getPet(petId),
        this.pets.getRecords(petId),
      ]);
      this.pet = pet;
      this.records = records;
    } catch (error) {
      this.error = errorMessage(error);
    } finally {
      this.loading = false;
    }
  }

  private blankRecord(): Omit<PetRecord, 'id'> {
    return {
      petId: '',
      category: 'vaccination',
      title: '',
      date: today(),
      nextDate: '',
      veterinarian: '',
      weightKg: null,
      notes: '',
      createdAt: '',
    };
  }

  openRecord(record?: PetRecord): void {
    const pet = this.pet;
    if (!pet) return;

    this.today = today();
    this.editingRecordId = record?.id || '';
    this.originalNextDate = record?.nextDate || '';
    this.recordError = '';
    if (record) {
      const { id, ...recordFields } = record;
      this.record = recordFields;
    } else {
      this.record = this.blankRecord();
      this.record.petId = pet.id;
    }
    this.recordForm.resetForm(this.record);
    this.recordDialog.nativeElement.showModal();
  }

  get keepsOverdueDate(): boolean {
    const nextDate = this.record.nextDate;
    if (!nextDate || nextDate !== this.originalNextDate) return false;
    return nextDate < this.today;
  }

  get recordTitleLabel(): string {
    if (this.record.category === 'vaccination') return 'Vaccine name';
    if (this.record.category === 'medical') return 'Visit or treatment';
    return 'Note title';
  }

  get recordTitlePlaceholder(): string {
    if (this.record.category === 'vaccination') return 'e.g. Rabies vaccination';
    if (this.record.category === 'medical') return 'e.g. Annual checkup';
    return 'e.g. Monthly weight check';
  }

  async saveRecord(form: NgForm): Promise<void> {
    const pet = this.pet;
    if (form.invalid || this.saving || !pet) return;

    this.today = today();
    this.recordError = '';
    const recordTitle = this.record.title.trim();
    if (!recordTitle) {
      this.recordError = 'Please give this record a title.';
      return;
    }
    if (this.record.nextDate && this.record.nextDate < this.today && !this.keepsOverdueDate) {
      this.recordError = 'Choose today or a future date for the next reminder.';
      return;
    }
    // An existing overdue reminder may stay on the record when editing other fields.
    const invalidInput = this.recordDialog.nativeElement.querySelector<HTMLInputElement>(
      'input:invalid:not([name="nextDate"])',
    );
    if (invalidInput) {
      invalidInput.reportValidity();
      return;
    }
    if (this.record.nextDate && this.record.nextDate < this.record.date) {
      this.recordError = 'The next due date must be on or after the record date.';
      return;
    }
    this.saving = true;
    try {
      let weightKg: number | null = null;
      if (this.record.category === 'health' && this.record.weightKg != null) {
        weightKg = Number(this.record.weightKg);
      }
      const recordToSave = {
        ...this.record,
        petId: pet.id,
        title: recordTitle,
        veterinarian: this.record.veterinarian.trim(),
        notes: this.record.notes.trim(),
        weightKg,
        createdAt: this.record.createdAt || new Date().toISOString(),
      };
      const savedRecord = await this.pets.saveRecord(recordToSave, this.editingRecordId || undefined);
      const updatedRecords = this.records.filter((record) => record.id !== savedRecord.id);
      updatedRecords.push(savedRecord);
      updatedRecords.sort((first, second) => second.date.localeCompare(first.date));
      this.records = updatedRecords;
      this.recordDialog.nativeElement.close();
    } catch (error) {
      this.recordError = errorMessage(error);
    } finally {
      this.saving = false;
    }
  }

  confirmDelete(record?: PetRecord): void {
    this.deleteRecordTarget = record || null;
    this.deleteDialog.nativeElement.showModal();
  }

  preventBusyClose(event: Event, busy: boolean): void {
    if (busy) event.preventDefault();
  }

  async deleteItem(): Promise<void> {
    if (this.deleting || !this.pet) return;
    this.deleting = true;
    this.error = '';
    try {
      const recordToDelete = this.deleteRecordTarget;
      if (recordToDelete) {
        await this.pets.deleteRecord(recordToDelete.id);
        this.records = this.records.filter((record) => record.id !== recordToDelete.id);
      } else {
        await this.pets.deletePet(this.pet.id);
        await this.router.navigateByUrl('/app', { replaceUrl: true });
      }
      this.deleteDialog.nativeElement.close();
    } catch (error) {
      this.error = errorMessage(error);
      this.deleteDialog.nativeElement.close();
    } finally {
      this.deleting = false;
    }
  }
}
