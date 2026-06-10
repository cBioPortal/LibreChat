import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { TFeedback, getTagsForRating } from 'librechat-data-provider';
import { useSubmitProductFeedbackMutation } from 'librechat-data-provider/react-query';
import {
  Button,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  ThumbUpIcon,
  ThumbDownIcon,
  useToastContext,
} from '@librechat/client';
import { CheckCircle, Lightbulb, PenTool, Search } from 'lucide-react';
import ProductFeedbackModal, {
  type ProductFeedbackPayload,
  type ProductFeedbackInitialValues,
  type FeedbackReason,
} from './ProductFeedbackModal';
import { useGetStartupConfig } from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface FeedbackProps {
  handleFeedback: ({ feedback }: { feedback: TFeedback | undefined }) => void;
  feedback?: TFeedback;
  isLast?: boolean;
  conversationId?: string;
  messageId?: string;
  endpoint?: string;
  model?: string;
  agent_id?: string;
}

const ICONS = {
  CheckCircle,
  Lightbulb,
  PenTool,
  Search,
};

function FeedbackButtons({
  isLast,
  feedback,
  onFeedback,
  onOther,
  onReportIssue,
  onThumbsUpModal,
  productFeedbackEnabled,
}: {
  isLast: boolean;
  feedback?: TFeedback;
  onFeedback: (fb: TFeedback | undefined) => void;
  onOther?: () => void;
  onReportIssue?: () => void;
  onThumbsUpModal?: () => void;
  productFeedbackEnabled?: boolean;
}) {
  const localize = useLocalize();

  const handleThumbsUpClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (feedback?.rating !== 'thumbsUp') {
        onThumbsUpModal?.();
        return;
      }
      onFeedback(undefined);
    },
    [feedback, onFeedback, onThumbsUpModal],
  );

  const handleThumbsDownClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (productFeedbackEnabled) {
        onReportIssue?.();
      } else {
        onFeedback({ rating: 'thumbsDown' });
        onOther?.();
      }
    },
    [productFeedbackEnabled, onReportIssue, onFeedback, onOther],
  );

  return (
    <>
      <button
        className={thumbsUpClasses(feedback?.rating === 'thumbsUp', isLast)}
        onClick={handleThumbsUpClick}
        type="button"
        title={localize('com_ui_feedback_positive')}
        aria-pressed={feedback?.rating === 'thumbsUp'}
      >
        <ThumbUpIcon size="19" bold={feedback?.rating === 'thumbsUp'} />
      </button>

      <button
        className={thumbsDownClasses(feedback?.rating === 'thumbsDown', isLast)}
        onClick={handleThumbsDownClick}
        type="button"
        title={localize('com_ui_feedback_negative')}
        aria-pressed={feedback?.rating === 'thumbsDown'}
      >
        <ThumbDownIcon size="19" bold={feedback?.rating === 'thumbsDown'} />
      </button>
    </>
  );
}

function thumbsUpClasses(isActive: boolean, isLast: boolean) {
  return cn(
    'hover-button rounded-lg p-1.5 text-green-500',
    'hover:text-green-600 hover:bg-surface-hover',
    'md:group-hover:visible md:group-focus-within:visible md:group-[.final-completion]:visible',
    !isLast && 'md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100',
    'focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white focus-visible:outline-none',
    isActive && 'active text-green-600 bg-surface-hover',
  );
}

function thumbsDownClasses(isActive: boolean, isLast: boolean) {
  return cn(
    'hover-button rounded-lg p-1.5 text-red-500',
    'hover:text-red-600 hover:bg-surface-hover',
    'md:group-hover:visible md:group-focus-within:visible md:group-[.final-completion]:visible',
    !isLast && 'md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100',
    'focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white focus-visible:outline-none',
    isActive && 'active text-red-600 bg-surface-hover',
  );
}

export default function Feedback({
  isLast = false,
  handleFeedback,
  feedback: initialFeedback,
  conversationId,
  messageId,
  endpoint,
  model,
  agent_id,
}: FeedbackProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [openDialog, setOpenDialog] = useState(false);
  const [openThumbsUpModal, setOpenThumbsUpModal] = useState(false);
  const [openProductFeedback, setOpenProductFeedback] = useState(false);
  const [productFeedbackInitial, setProductFeedbackInitial] = useState<
    ProductFeedbackInitialValues | undefined
  >();
  const [feedback, setFeedback] = useState<TFeedback | undefined>(initialFeedback);
  const { data: startupConfig } = useGetStartupConfig();
  const productFeedbackEnabled = startupConfig?.productFeedbackEnabled === true;
  const submitProductFeedback = useSubmitProductFeedbackMutation();

  // Thumbs-up modal state
  const positiveTags = useMemo(() => getTagsForRating('thumbsUp'), []);
  const [selectedUpTags, setSelectedUpTags] = useState<Set<string>>(new Set());
  const [thumbsUpComment, setThumbsUpComment] = useState('');

  useEffect(() => {
    setFeedback(initialFeedback);
  }, [initialFeedback]);

  const propagateMinimal = useCallback(
    (fb: TFeedback | undefined) => {
      setFeedback(fb);
      handleFeedback({ feedback: fb });
    },
    [handleFeedback],
  );

  const handleButtonFeedback = useCallback(
    (fb: TFeedback | undefined) => {
      if (fb?.tag?.key === 'other') setOpenDialog(true);
      else setOpenDialog(false);
      propagateMinimal(fb);
    },
    [propagateMinimal],
  );

  const handleOtherOpen = useCallback(() => setOpenDialog(true), []);

  const handleReportIssueOpen = useCallback(() => setOpenProductFeedback(true), []);

  const handleThumbsUpModalOpen = useCallback(() => {
    setSelectedUpTags(new Set());
    setThumbsUpComment('');
    setOpenThumbsUpModal(true);
  }, []);

  const handleThumbsUpSubmit = useCallback(() => {
    const tagKeys = Array.from(selectedUpTags);
    const firstTag =
      tagKeys.length > 0 ? positiveTags.find((t) => t.key === tagKeys[0]) : undefined;
    const text = [tagKeys.length > 1 ? `tags:${tagKeys.join(',')}` : '', thumbsUpComment.trim()]
      .filter(Boolean)
      .join('\n');

    propagateMinimal({
      rating: 'thumbsUp',
      tag: firstTag,
      ...(text ? { text } : {}),
    });
    setOpenThumbsUpModal(false);
    showToast({
      message: 'Thank you for your feedback!',
      severity: NotificationSeverity.SUCCESS,
      showIcon: true,
      duration: 5000,
    });
  }, [selectedUpTags, thumbsUpComment, positiveTags, propagateMinimal, showToast]);

  const handleThumbsUpCancel = useCallback(() => {
    setOpenThumbsUpModal(false);
  }, []);

  const toggleUpTag = useCallback((key: string) => {
    setSelectedUpTags((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFeedback((prev) => (prev ? { ...prev, text: e.target.value } : undefined));
  };

  const handleDialogSave = useCallback(() => {
    if (feedback?.tag?.key === 'other' && !feedback?.text?.trim()) {
      return;
    }
    propagateMinimal(feedback);
    setOpenDialog(false);
  }, [feedback, propagateMinimal]);

  const handleDialogClear = useCallback(() => {
    setFeedback(undefined);
    handleFeedback({ feedback: undefined });
    setOpenDialog(false);
  }, [handleFeedback]);

  const handleProductFeedbackDelete = useCallback(() => {
    propagateMinimal(undefined);
    setOpenProductFeedback(false);
  }, [propagateMinimal]);

  const handleThumbsUpDelete = useCallback(() => {
    propagateMinimal(undefined);
    setOpenThumbsUpModal(false);
  }, [propagateMinimal]);

  const handleProductFeedbackSubmit = useCallback(
    (payload: ProductFeedbackPayload) => {
      // Store the full feedback payload as JSON in the existing feedback text field
      const fullFeedback: TFeedback = {
        rating: 'thumbsDown',
        tag: undefined,
        text: JSON.stringify({
          request_id: payload.request_id,
          feedback_reason: payload.feedback_reason,
          feedback_title: payload.feedback_title,
          feedback_details: payload.feedback_details,
          feedback_suggested_fix: payload.feedback_suggested_fix,
          suggested_system_prompt: payload.suggested_system_prompt,
          conversation_id: payload.conversation_id,
          message_id: payload.message_id,
          messages: payload.messages,
          endpoint: payload.endpoint,
          model: payload.model,
          agent_id: payload.agent_id,
        }),
      };
      setFeedback(fullFeedback);
      handleFeedback({ feedback: fullFeedback });

      const mutationPayload = {
        request_id: payload.request_id,
        user: { username: payload.user_email ?? payload.user_id ?? '' },
        timestamp: new Date().toISOString(),
        feedback_reason: payload.feedback_reason,
        feedback_title: payload.feedback_title,
        feedback_details: payload.feedback_details,
        feedback_suggested_fix: payload.feedback_suggested_fix,
        ...(payload.suggested_system_prompt
          ? { suggested_system_prompt: payload.suggested_system_prompt }
          : {}),
        conversation: {
          conversation_id: payload.conversation_id,
          message_id: payload.message_id,
          last_n_messages: payload.messages,
        },
        metadata: {
          librechat_version: '',
          client: 'web',
          endpoint: payload.endpoint,
          model: payload.model,
          agent_id: payload.agent_id,
        },
        ...(payload.user_email ? { contact: { email: payload.user_email } } : {}),
      };

      submitProductFeedback.mutate(mutationPayload, {
        onSuccess: () => {
          showToast({
            message: 'Thank you for your feedback!',
            severity: NotificationSeverity.SUCCESS,
            showIcon: true,
            duration: 5000,
          });
        },
        onError: () => {
          showToast({
            message: localize('com_ui_product_feedback_error' as Parameters<typeof localize>[0]),
            severity: NotificationSeverity.ERROR,
            showIcon: true,
          });
        },
      });
    },
    [submitProductFeedback, handleFeedback, showToast, localize],
  );

  const handleActiveFeedbackClick = useCallback(() => {
    if (!feedback) return;
    if (feedback.rating === 'thumbsUp') {
      // Pre-fill thumbs-up modal from stored feedback
      const tagKeys: string[] = [];
      if (feedback.tag?.key) {
        tagKeys.push(feedback.tag.key);
      }
      let comment = '';
      if (feedback.text) {
        const lines = feedback.text.split('\n');
        if (lines[0].startsWith('tags:')) {
          const extraKeys = lines[0].slice(5).split(',').filter(Boolean);
          for (const k of extraKeys) {
            if (!tagKeys.includes(k)) {
              tagKeys.push(k);
            }
          }
          comment = lines.slice(1).join('\n').trim();
        } else {
          comment = feedback.text.trim();
        }
      }
      setSelectedUpTags(new Set(tagKeys));
      setThumbsUpComment(comment);
      setOpenThumbsUpModal(true);
    } else if (productFeedbackEnabled) {
      // Parse stored JSON for product feedback initial values
      let reasons: FeedbackReason[] = [];
      let details = '';
      let suggestedFix = '';
      let suggestedSystemPrompt: string | undefined;
      if (feedback.text) {
        try {
          const parsed = JSON.parse(feedback.text);
          if (parsed.feedback_reason) {
            reasons = parsed.feedback_reason.split(',').filter(Boolean) as FeedbackReason[];
          }
          details = parsed.feedback_details || '';
          suggestedFix = parsed.feedback_suggested_fix || '';
          suggestedSystemPrompt = parsed.suggested_system_prompt;
        } catch {
          details = feedback.text;
        }
      }
      setProductFeedbackInitial({ reasons, details, suggestedFix, suggestedSystemPrompt });
      setOpenProductFeedback(true);
    } else {
      setOpenDialog(true);
    }
  }, [feedback, productFeedbackEnabled]);

  const renderSingleFeedbackButton = () => {
    if (!feedback) return null;
    const isThumbsUp = feedback.rating === 'thumbsUp';
    const Icon = isThumbsUp ? ThumbUpIcon : ThumbDownIcon;
    const label = isThumbsUp
      ? localize('com_ui_feedback_positive')
      : localize('com_ui_feedback_negative');
    const classes = isThumbsUp ? thumbsUpClasses(true, isLast) : thumbsDownClasses(true, isLast);
    return (
      <button
        className={classes}
        onClick={handleActiveFeedbackClick}
        type="button"
        title={label}
        aria-pressed="true"
      >
        <Icon size="19" bold />
      </button>
    );
  };

  return (
    <>
      {feedback ? (
        renderSingleFeedbackButton()
      ) : (
        <FeedbackButtons
          isLast={isLast}
          feedback={feedback}
          onFeedback={handleButtonFeedback}
          onOther={handleOtherOpen}
          onReportIssue={handleReportIssueOpen}
          onThumbsUpModal={handleThumbsUpModalOpen}
          productFeedbackEnabled={productFeedbackEnabled}
        />
      )}

      {/* Thumbs-up modal */}
      <OGDialog open={openThumbsUpModal} onOpenChange={setOpenThumbsUpModal}>
        <OGDialogContent className="w-11/12 max-w-md">
          <OGDialogTitle className="text-token-text-primary text-lg font-semibold leading-6">
            {localize('com_ui_feedback_positive')}
          </OGDialogTitle>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {positiveTags.map((tag) => {
                const Icon = ICONS[tag.icon as keyof typeof ICONS] || CheckCircle;
                const label = localize(tag.label as Parameters<typeof localize>[0]);
                const active = selectedUpTags.has(tag.key);
                return (
                  <button
                    key={tag.key}
                    type="button"
                    onClick={() => toggleUpTag(tag.key)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors duration-200',
                      active
                        ? 'border-text-primary bg-text-primary font-semibold text-surface-primary'
                        : 'border-border-medium bg-transparent text-text-secondary hover:border-text-secondary hover:text-text-primary',
                    )}
                  >
                    <Icon size={16} aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
            <textarea
              className="w-full rounded-xl border border-border-light bg-transparent p-2 text-sm text-text-primary placeholder:text-text-secondary"
              placeholder="Add a comment (optional)"
              value={thumbsUpComment}
              onChange={(e) => setThumbsUpComment(e.target.value)}
              rows={3}
              maxLength={500}
            />
            <div className="flex items-end justify-end gap-2">
              {feedback?.rating === 'thumbsUp' && (
                <Button
                  variant="destructive"
                  onClick={handleThumbsUpDelete}
                  className="mr-auto"
                >
                  {localize('com_ui_delete')}
                </Button>
              )}
              <Button variant="outline" onClick={handleThumbsUpCancel}>
                {localize('com_ui_cancel')}
              </Button>
              <Button variant="submit" onClick={handleThumbsUpSubmit}>
                {localize('com_ui_product_feedback_submit' as Parameters<typeof localize>[0])}
              </Button>
            </div>
          </div>
        </OGDialogContent>
      </OGDialog>

      {/* "Other" text dialog (for thumbs-down non-product-feedback path) */}
      <OGDialog open={openDialog} onOpenChange={setOpenDialog}>
        <OGDialogContent className="w-11/12 max-w-lg">
          <OGDialogTitle className="text-token-text-primary text-lg font-semibold leading-6">
            {localize('com_ui_feedback_more_information')}
          </OGDialogTitle>
          <textarea
            className="w-full rounded-xl border border-border-light bg-transparent p-2 text-text-primary"
            value={feedback?.text || ''}
            onChange={handleTextChange}
            rows={4}
            placeholder={localize('com_ui_feedback_placeholder')}
            maxLength={500}
          />
          <div className="mt-4 flex items-end justify-end gap-2">
            <Button variant="destructive" onClick={handleDialogClear}>
              {localize('com_ui_delete')}
            </Button>
            <Button variant="submit" onClick={handleDialogSave} disabled={!feedback?.text?.trim()}>
              {localize('com_ui_save')}
            </Button>
          </div>
        </OGDialogContent>
      </OGDialog>

      {/* Product feedback modal (thumbs-down with productFeedbackEnabled) */}
      {productFeedbackEnabled && conversationId && messageId && (
        <ProductFeedbackModal
          open={openProductFeedback}
          onOpenChange={setOpenProductFeedback}
          conversationId={conversationId}
          messageId={messageId}
          endpoint={endpoint}
          model={model}
          agent_id={agent_id}
          onSubmit={handleProductFeedbackSubmit}
          initialValues={productFeedbackInitial}
          onDelete={feedback?.rating === 'thumbsDown' ? handleProductFeedbackDelete : undefined}
        />
      )}

    </>
  );
}
