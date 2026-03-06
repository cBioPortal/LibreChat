import React, { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { Button, OGDialog, OGDialogContent, OGDialogTitle } from '@librechat/client';
import { useLocalize, useAuthContext } from '~/hooks';
import { cn } from '~/utils';

interface ProductFeedbackModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  messageId: string;
  endpoint?: string;
  model?: string;
  agent_id?: string;
  onSubmit?: (payload: ProductFeedbackPayload) => void;
  onSuccess?: (issueUrl: string) => void;
}

interface ConversationMessage {
  timestamp: string;
  is_user: boolean;
  text: string;
}

export interface ProductFeedbackPayload {
  request_id: string;
  feedback_reason: string;
  feedback_title: string;
  feedback_details: string;
  feedback_suggested_fix: string;
  conversation_id: string;
  message_id: string;
  user_id: string | undefined;
  user_email: string | undefined;
  messages: ConversationMessage[];
  endpoint?: string;
  model?: string;
  agent_id?: string;
}

type FeedbackReason =
  | 'incorrect'
  | 'unfaithful'
  | 'safety_or_legal_concern'
  | 'style_tone_conciseness'
  | 'other';

const FEEDBACK_REASONS: { value: FeedbackReason; labelKey: string }[] = [
  { value: 'incorrect', labelKey: 'com_ui_product_feedback_reason_incorrect' },
  { value: 'unfaithful', labelKey: 'com_ui_product_feedback_reason_unfaithful' },
  { value: 'safety_or_legal_concern', labelKey: 'com_ui_product_feedback_reason_safety' },
  { value: 'style_tone_conciseness', labelKey: 'com_ui_product_feedback_reason_style' },
  { value: 'other', labelKey: 'com_ui_product_feedback_reason_other' },
];

export default function ProductFeedbackModal({
  open,
  onOpenChange,
  conversationId,
  messageId,
  endpoint,
  model,
  agent_id,
  onSubmit,
  onSuccess,
}: ProductFeedbackModalProps) {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const queryClient = useQueryClient();

  const [feedbackReason, setFeedbackReason] = useState<FeedbackReason | ''>('');
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [feedbackDetails, setFeedbackDetails] = useState('');
  const [feedbackSuggestedFix, setFeedbackSuggestedFix] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSubmitDisabled = !feedbackReason || !feedbackTitle.trim() || isSubmitting;

  const resetForm = useCallback(() => {
    setFeedbackReason('');
    setFeedbackTitle('');
    setFeedbackDetails('');
    setFeedbackSuggestedFix('');
    setError(null);
    setIsSubmitting(false);
  }, []);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        resetForm();
      }
      onOpenChange(isOpen);
    },
    [onOpenChange, resetForm],
  );

  const handleSubmit = useCallback(async () => {
    if (isSubmitDisabled) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const messages =
        queryClient.getQueryData<TMessage[]>([QueryKeys.messages, conversationId]) ?? [];

      const lastMessages = messages.slice(-10).map((msg) => ({
        timestamp: msg.createdAt ?? new Date().toISOString(),
        is_user: msg.isCreatedByUser,
        text: msg.text,
      }));

      const requestId = crypto.randomUUID();

      const payload: ProductFeedbackPayload = {
        request_id: requestId,
        feedback_reason: feedbackReason,
        feedback_title: feedbackTitle.trim(),
        feedback_details: feedbackDetails.trim(),
        feedback_suggested_fix: feedbackSuggestedFix.trim(),
        conversation_id: conversationId,
        message_id: messageId,
        user_id: user?.id,
        user_email: user?.email,
        messages: lastMessages,
        endpoint,
        model,
        agent_id,
      };

      if (onSubmit) {
        onSubmit(payload);
      }

      resetForm();
      onOpenChange(false);
      onSuccess?.('');
    } catch {
      setError(localize('com_ui_product_feedback_error' as Parameters<typeof localize>[0]));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitDisabled,
    queryClient,
    conversationId,
    feedbackReason,
    feedbackTitle,
    feedbackDetails,
    feedbackSuggestedFix,
    messageId,
    user,
    endpoint,
    model,
    agent_id,
    onSubmit,
    onSuccess,
    onOpenChange,
    resetForm,
    localize,
  ]);

  return (
    <OGDialog open={open} onOpenChange={handleOpenChange}>
      <OGDialogContent className="w-11/12 max-w-lg">
        <OGDialogTitle className="text-token-text-primary text-lg font-semibold leading-6">
          {localize('com_ui_product_feedback_title' as Parameters<typeof localize>[0])}
        </OGDialogTitle>

        <div className="flex flex-col gap-4">
          {/* Feedback Reason Pills */}
          <div>
            <label className="mb-2 block text-sm font-medium text-text-primary">
              {localize('com_ui_product_feedback_reason' as Parameters<typeof localize>[0])}
            </label>
            <div className="flex flex-wrap gap-2">
              {FEEDBACK_REASONS.map(({ value, labelKey }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFeedbackReason(value)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-sm transition-colors duration-200',
                    feedbackReason === value
                      ? 'border-text-primary bg-text-primary text-surface-primary font-semibold'
                      : 'border-border-medium bg-transparent text-text-secondary hover:border-text-secondary hover:text-text-primary',
                  )}
                >
                  {localize(labelKey as Parameters<typeof localize>[0])}
                </button>
              ))}
            </div>
          </div>

          {/* Feedback Title */}
          <div>
            <input
              type="text"
              className="w-full rounded-xl border border-border-light bg-transparent p-2 text-sm text-text-primary placeholder:text-text-secondary"
              placeholder={localize(
                'com_ui_product_feedback_issue_title' as Parameters<typeof localize>[0],
              )}
              value={feedbackTitle}
              onChange={(e) => setFeedbackTitle(e.target.value)}
              maxLength={200}
            />
          </div>

          {/* Feedback Details */}
          <div>
            <label className="mb-1 block text-sm font-medium text-text-primary">
              {localize('com_ui_product_feedback_details' as Parameters<typeof localize>[0])}
              <span className="ml-1 text-xs font-normal text-text-secondary">
                ({localize('com_ui_product_feedback_optional' as Parameters<typeof localize>[0])})
              </span>
            </label>
            <textarea
              className="w-full rounded-xl border border-border-light bg-transparent p-2 text-sm text-text-primary placeholder:text-text-secondary"
              placeholder={localize(
                'com_ui_product_feedback_details_placeholder' as Parameters<typeof localize>[0],
              )}
              value={feedbackDetails}
              onChange={(e) => setFeedbackDetails(e.target.value)}
              rows={4}
              maxLength={2000}
            />
          </div>

          {/* Suggested Fix */}
          <div>
            <label className="mb-1 block text-sm font-medium text-text-primary">
              {localize(
                'com_ui_product_feedback_suggested_fix' as Parameters<typeof localize>[0],
              )}
              <span className="ml-1 text-xs font-normal text-text-secondary">
                ({localize('com_ui_product_feedback_optional' as Parameters<typeof localize>[0])})
              </span>
            </label>
            <textarea
              className="w-full rounded-xl border border-border-light bg-transparent p-2 text-sm text-text-primary placeholder:text-text-secondary"
              placeholder={localize(
                'com_ui_product_feedback_suggested_fix_placeholder' as Parameters<typeof localize>[0],
              )}
              value={feedbackSuggestedFix}
              onChange={(e) => setFeedbackSuggestedFix(e.target.value)}
              rows={3}
              maxLength={2000}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-lg bg-red-100 p-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-end justify-end gap-2">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              {localize('com_ui_product_feedback_cancel' as Parameters<typeof localize>[0])}
            </Button>
            <Button variant="submit" onClick={handleSubmit} disabled={isSubmitDisabled}>
              {localize('com_ui_product_feedback_submit' as Parameters<typeof localize>[0])}
            </Button>
          </div>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
