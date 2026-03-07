import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('virtual_gifts')
export class Gift {
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;

  @Column()
  emoji: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price: number;
}
