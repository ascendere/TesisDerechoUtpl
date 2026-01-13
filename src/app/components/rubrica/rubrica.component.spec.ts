import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RubricaComponent } from './rubrica.component';

describe('RubricaComponent', () => {
  let component: RubricaComponent;
  let fixture: ComponentFixture<RubricaComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [RubricaComponent]
    });
    fixture = TestBed.createComponent(RubricaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
