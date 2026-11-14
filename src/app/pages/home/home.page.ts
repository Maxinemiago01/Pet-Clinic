import { Component, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { Pet, PetRecord, petAge, today } from '../../models';
import { PetService } from '../../services/pet.service';
import { errorMessage } from '../../services/errors';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [FormsModule, RouterLink, IonIcon, IonSpinner],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage implements OnInit {
  pets: Pet[] = [];
  records: PetRecord[] = [];
  loading = true;
  error = '';
  search = '';
  filter = 'All pets';
  filters = ['All pets', 'Dogs', 'Cats'];
  petAge = petAge;
  today = today();
  constructor(private petService: PetService) {}
  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      const [pets, records] = await Promise.all([
        this.petService.getPets(),
        this.petService.getRecords(),
      ]);
      this.pets = pets;
      this.records = records;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 0) {
        this.error = 'Couldn’t load pets.';
      } else {
        this.error = errorMessage(error);
      }
    } finally {
      this.loading = false;
    }
  }

  get filteredPets(): Pet[] {
    const searchText = this.search.trim().toLowerCase();
    const matchingPets: Pet[] = [];

    for (const pet of this.pets) {
      const petDetails = `${pet.name} ${pet.breed} ${pet.species}`.toLowerCase();
      if (!petDetails.includes(searchText)) continue;
      if (this.filter === 'Dogs' && pet.species !== 'Dog') continue;
      if (this.filter === 'Cats' && pet.species !== 'Cat') continue;
      matchingPets.push(pet);
    }

    return matchingPets;
  }

  get dueCount(): number {
    let numberDue = 0;
    for (const record of this.records) {
      if (!record.nextDate || record.nextDate > this.today) continue;
      const petExists = this.pets.some((pet) => pet.id === record.petId);
      if (petExists) numberDue++;
    }
    return numberDue;
  }
}
