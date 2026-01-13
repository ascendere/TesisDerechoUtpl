import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminDataComponent } from './admin-data.component';

describe('AdminDataComponent', () => {
  let component: AdminDataComponent;
  let fixture: ComponentFixture<AdminDataComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [AdminDataComponent]
    });
    fixture = TestBed.createComponent(AdminDataComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
