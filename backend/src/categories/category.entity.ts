import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('categories')
export class Category {
  @PrimaryColumn()
  id: string;

  @Column()
  label: string;
}
