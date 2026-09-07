import { TeacherRoom } from '@/components/teacher-room';

export default async function DisplayPage({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await params;
  return <TeacherRoom code={roomCode.toUpperCase()} displayOnly/>;
}
