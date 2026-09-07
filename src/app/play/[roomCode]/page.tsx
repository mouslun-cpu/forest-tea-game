import StudentRoom from '@/components/student-room';
export default async function PlayPage({params}:{params:Promise<{roomCode:string}>}) { const {roomCode}=await params;return <StudentRoom code={roomCode.toUpperCase()}/>; }
