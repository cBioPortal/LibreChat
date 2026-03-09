import React, { useState, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { Button, OGDialog, OGDialogContent, OGDialogTitle } from '@librechat/client';
import { useGetStartupConfig } from '~/data-provider';
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
  suggested_system_prompt?: string;
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

const PLACEHOLDER_MAP: Record<FeedbackReason, string> = {
  incorrect: 'It is incorrect because...',
  unfaithful: "The response doesn't match the source because...",
  safety_or_legal_concern: 'The safety/legal concern is...',
  style_tone_conciseness: 'The style issue is...',
  other: 'Describe the issue...',
};

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
  const { data: startupConfig } = useGetStartupConfig();

  const [feedbackReasons, setFeedbackReasons] = useState<FeedbackReason[]>([]);
  const [feedbackDetails, setFeedbackDetails] = useState('');
  const [feedbackSuggestedFix, setFeedbackSuggestedFix] = useState('');
  const [suggestedSystemPrompt, setSuggestedSystemPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isPowerUser = useMemo(() => {
    const emails = startupConfig?.powerUserEmails;
    if (!emails || !user?.email) return false;
    return emails.includes(user.email);
  }, [startupConfig?.powerUserEmails, user?.email]);

  const isSubmitDisabled = isSubmitting;

  const detailsPlaceholder = useMemo(() => {
    if (feedbackReasons.length === 1) {
      return PLACEHOLDER_MAP[feedbackReasons[0]];
    }
    return 'Describe the issue...';
  }, [feedbackReasons]);

  const toggleReason = useCallback((reason: FeedbackReason) => {
    setFeedbackReasons((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason],
    );
  }, []);

  const resetForm = useCallback(() => {
    setFeedbackReasons([]);
    setFeedbackDetails('');
    setFeedbackSuggestedFix('');
    setSuggestedSystemPrompt('');
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

      const lastMessages = messages.slice(-10).map((msg) => {
        let text = msg.text;
        if (!text && Array.isArray(msg.content)) {
          text = msg.content
            .filter((c) => c.type === 'text')
            .map((c) => c.text)
            .join('\n');
        }
        return {
          timestamp: msg.createdAt ?? new Date().toISOString(),
          is_user: msg.isCreatedByUser,
          text: text ?? '',
        };
      });

      const requestId = crypto.randomUUID();

      const payload: ProductFeedbackPayload = {
        request_id: requestId,
        feedback_reason: feedbackReasons.join(','),
        feedback_title: '',
        feedback_details: feedbackDetails.trim(),
        feedback_suggested_fix: feedbackSuggestedFix.trim(),
        ...(suggestedSystemPrompt.trim()
          ? { suggested_system_prompt: suggestedSystemPrompt.trim() }
          : {}),
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
    feedbackReasons,
    feedbackDetails,
    feedbackSuggestedFix,
    suggestedSystemPrompt,
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
          {/* Feedback Reason Pills (optional, multi-select) */}
          <div>
            <label className="mb-2 block text-sm font-medium text-text-primary">
              {localize('com_ui_product_feedback_reason' as Parameters<typeof localize>[0])}
              <span className="ml-1 text-xs font-normal text-text-secondary">
                ({localize('com_ui_product_feedback_optional' as Parameters<typeof localize>[0])})
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              {FEEDBACK_REASONS.map(({ value, labelKey }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleReason(value)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-sm transition-colors duration-200',
                    feedbackReasons.includes(value)
                      ? 'border-text-primary bg-text-primary text-surface-primary font-semibold'
                      : 'border-border-medium bg-transparent text-text-secondary hover:border-text-secondary hover:text-text-primary',
                  )}
                >
                  {localize(labelKey as Parameters<typeof localize>[0])}
                </button>
              ))}
            </div>
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
              placeholder={detailsPlaceholder}
              value={feedbackDetails}
              onChange={(e) => setFeedbackDetails(e.target.value)}
              rows={4}
              maxLength={2000}
            />
          </div>

          {/* Expected Outcome (was "Suggested Fix") */}
          <div>
            <label className="mb-1 block text-sm font-medium text-text-primary">
              Expected Outcome
              <span className="ml-1 text-xs font-normal text-text-secondary">
                ({localize('com_ui_product_feedback_optional' as Parameters<typeof localize>[0])})
              </span>
            </label>
            <textarea
              className="w-full rounded-xl border border-border-light bg-transparent p-2 text-sm text-text-primary placeholder:text-text-secondary"
              placeholder="What did you expect the response to be?"
              value={feedbackSuggestedFix}
              onChange={(e) => setFeedbackSuggestedFix(e.target.value)}
              rows={3}
              maxLength={2000}
            />
          </div>

          {/* Suggested System Prompt (power users only) */}
          {isPowerUser && (
            <div>
              <label className="mb-1 block text-sm font-medium text-text-primary">
                Suggested System Prompt
                <span className="ml-1 text-xs font-normal text-text-secondary">
                  ({localize(
                    'com_ui_product_feedback_optional' as Parameters<typeof localize>[0],
                  )})
                </span>
              </label>
              <textarea
                className="w-full rounded-xl border border-border-light bg-transparent p-2 text-sm text-text-primary placeholder:text-text-secondary"
                placeholder="Suggest changes to the system prompt..."
                value={suggestedSystemPrompt}
                onChange={(e) => setSuggestedSystemPrompt(e.target.value)}
                rows={3}
                maxLength={4000}
              />
            </div>
          )}

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
