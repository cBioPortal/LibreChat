import type { Document } from 'mongoose';

export interface IProductFeedback extends Document {
  request_id: string;
  user: string;
  username: string;
  feedback_reason: 'incorrect' | 'unfaithful' | 'safety_or_legal_concern' | 'style_tone_conciseness' | 'other';
  feedback_title?: string;
  feedback_details?: string;
  feedback_suggested_fix?: string;
  suggested_system_prompt?: string;
  conversation?: {
    conversation_id: string;
    message_id: string;
    last_n_messages?: Array<{ timestamp: string; is_user: boolean; text: string }>;
  };
  metadata?: {
    librechat_version?: string;
    client?: string;
    endpoint?: string;
    model?: string;
    agent_id?: string;
  };
  contact?: {
    email?: string;
  };
  createdAt?: Date;
  updatedAt?: Date;
}
