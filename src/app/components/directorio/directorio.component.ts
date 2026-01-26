import { Component, OnInit } from '@angular/core';
import { DirectorioService } from '../../services/directorio.service';

@Component({
  selector: 'app-directorio',
  templateUrl: './directorio.component.html',
  styleUrls: ['./directorio.component.css'],
})
export class DirectorioComponent implements OnInit {
  viewMode: 'subjects' | 'teachers' = 'subjects';
  data$: any; // Observable para async pipe
  searchTerm: string = '';

  showEditModal = false;
  editMode: 'teacher' | 'subject' | null = null;
  selectedItem: any = null;
  selectedPhotoFile: File | null = null;
  previewPhoto: string | ArrayBuffer | null = null;

  constructor(private directoryService: DirectorioService) {}

  ngOnInit() {
    this.search();
  }

  search() {
    if (this.viewMode === 'subjects') {
      this.data$ = this.directoryService.getSubjects(this.searchTerm);
    } else {
      this.data$ = this.directoryService.getTeachers(this.searchTerm);
    }
  }

  onFileSelected(event: any, id: string) {
    const file = event.target.files[0];
    if (file) this.directoryService.uploadTeacherPhoto(id, file).subscribe();
  }

  saveUpdate(id: string, collection: string, field: string, value: string) {
    this.directoryService.updateRecord(collection, id, { [field]: value });
  }

  addQuestion(item: any) {
    if (!item.questions) {
      item.questions = [];
    }
    item.questions.push('');
  }

  removeQuestion(item: any, index: number) {
    item.questions.splice(index, 1);
    this.saveUpdate(item.id, 'subjects', 'questions', item.questions);
  }

  openEditModal(item: any) {
    this.selectedItem = JSON.parse(JSON.stringify(item)); // copia segura
    this.editMode = this.viewMode === 'teachers' ? 'teacher' : 'subject';
    this.showEditModal = true;
  }

  saveModalChanges() {
    if (!this.selectedItem) return;

    if (this.editMode === 'teacher') {
      this.saveUpdate(
        this.selectedItem.id,
        'users',
        'description',
        this.selectedItem.description,
      );
    }

    if (this.editMode === 'subject') {
      this.saveUpdate(
        this.selectedItem.id,
        'subjects',
        'description',
        this.selectedItem.description,
      );
      this.saveUpdate(
        this.selectedItem.id,
        'subjects',
        'questions',
        this.selectedItem.questions,
      );
    }

    this.closeModal();
  }
  closeModal() {
    this.showEditModal = false;
    this.selectedItem = null;
    this.editMode = null;
  }
}
