import productFeedbackSchema from '~/schema/productFeedback';
import type { IProductFeedback } from '~/types';

/**
 * Creates or returns the ProductFeedback model using the provided mongoose instance and schema
 */
export function createProductFeedbackModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.ProductFeedback ||
    mongoose.model<IProductFeedback>('ProductFeedback', productFeedbackSchema)
  );
}
