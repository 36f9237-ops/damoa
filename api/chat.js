import { createChatHandler } from '../server/chat.js';

// Vercel Node.js Function: API 비밀키는 서버 환경변수에서만 읽습니다.
export const POST = createChatHandler();
