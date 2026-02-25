export type TProductFeedbackReason =
  | 'incorrect'
  | 'unfaithful'
  | 'safety_or_legal_concern'
  | 'style_tone_conciseness'
  | 'other';

export type TProductFeedbackConversationMessage = {
  timestamp: string;
  is_user: boolean;
  text: string;
};

export type TProductFeedbackPayload = {
  request_id: string;
  user: string;
  timestamp: string;
  feedback_reason: TProductFeedbackReason;
  feedback_title: string;
  feedback_details: string;
  feedback_suggested_fix: string;
  conversation: {
    conversation_id: string;
    message_id: string;
    last_n_messages: TProductFeedbackConversationMessage[];
  };
  metadata: {
    librechat_version: string;
    client: string;
  };
  contact?: {
    email?: string;
  };
};

export type TProductFeedbackResponse = {
  issue_url: string;
  issue_number: number;
};
