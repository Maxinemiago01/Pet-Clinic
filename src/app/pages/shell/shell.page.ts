import { Component, OnInit } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { IonContent, IonIcon, NavController } from '@ionic/angular';
import { AuthService } from '../../services/auth.service';
import { PetService } from '../../services/pet.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, IonContent, IonIcon],
  templateUrl: './shell.page.html',
  styleUrl: './shell.page.scss',
  host: { '(document:visibilitychange)': 'refreshCareNotifications()' },
})
export class ShellPage implements OnInit {
  constructor(
    public auth: AuthService,
    private nav: NavController,
    private pets: PetService,
  ) {}

  ngOnInit(): void {
    this.refreshCareNotifications();
  }

  refreshCareNotifications(): void {
    if (document.visibilityState === 'visible') this.pets.refreshCareNotifications();
  }

  logout(): void {
    this.auth.logout();
    void this.nav.navigateRoot('/login', { replaceUrl: true });
  }
}
