import { Schema } from 'mongoose';
import type { IProductFeedback } from '~/types/productFeedback';

const productFeedbackSchema = new Schema<IProductFeedback>(
  {
    request_id: { type: String, required: true, unique: true, index: true },
    user: { type: String, required: true, index: true },
    username: { type: String },
    feedback_reason: {
      type: String,
      index: true,
    },
    feedback_title: { type: String },
    feedback_details: { type: String },
    feedback_suggested_fix: { type: String },
    suggested_system_prompt: { type: String },
    conversation: { type: Schema.Types.Mixed },
    metadata: { type: Schema.Types.Mixed },
    contact: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

export default productFeedbackSchema;
