import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FlujoComponent } from './flujo.component';

describe('FlujoComponent', () => {
  let component: FlujoComponent;
  let fixture: ComponentFixture<FlujoComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [FlujoComponent]
    });
    fixture = TestBed.createComponent(FlujoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
