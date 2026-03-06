import React, { useState, useCallback, useMemo, useEffect } from 'react';
import * as Ariakit from '@ariakit/react';
import { TFeedback, TFeedbackTag, getTagsForRating } from 'librechat-data-provider';
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
import {
  AlertCircle,
  PenTool,
  ImageOff,
  Ban,
  HelpCircle,
  CheckCircle,
  Lightbulb,
  Search,
} from 'lucide-react';
import ProductFeedbackModal, { type ProductFeedbackPayload } from './ProductFeedbackModal';
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
  AlertCircle,
  PenTool,
  ImageOff,
  Ban,
  HelpCircle,
  CheckCircle,
  Lightbulb,
  Search,
  ThumbsUp: ThumbUpIcon,
  ThumbsDown: ThumbDownIcon,
};

function FeedbackOptionButton({
  tag,
  active,
  onClick,
}: {
  tag: TFeedbackTag;
  active?: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const localize = useLocalize();
  const Icon = ICONS[tag.icon as keyof typeof ICONS] || AlertCircle;
  const label = localize(tag.label as Parameters<typeof localize>[0]);

  return (
    <button
      className={cn(
        'flex w-full items-center gap-3 rounded-xl p-2 text-text-secondary transition-colors duration-200 hover:bg-surface-hover hover:text-text-primary',
        active && 'bg-surface-hover font-semibold text-text-primary',
      )}
      onClick={onClick}
      type="button"
      aria-label={label}
      aria-pressed={active}
    >
      <Icon size="19" bold={active} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

function FeedbackButtons({
  isLast,
  feedback,
  onFeedback,
  onOther,
  onReportIssue,
  productFeedbackEnabled,
}: {
  isLast: boolean;
  feedback?: TFeedback;
  onFeedback: (fb: TFeedback | undefined) => void;
  onOther?: () => void;
  onReportIssue?: () => void;
  productFeedbackEnabled?: boolean;
}) {
  const localize = useLocalize();
  const upStore = Ariakit.usePopoverStore({ placement: 'bottom' });

  const positiveTags = useMemo(() => getTagsForRating('thumbsUp'), []);

  const upActive = feedback?.rating === 'thumbsUp' ? feedback.tag?.key : undefined;

  const handleThumbsUpClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (feedback?.rating !== 'thumbsUp') {
        upStore.toggle();
        return;
      }
      onFeedback(undefined);
    },
    [feedback, onFeedback, upStore],
  );

  const handleUpOption = useCallback(
    (tag: TFeedbackTag) => (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      upStore.hide();
      onFeedback({ rating: 'thumbsUp', tag });
      if (tag.key === 'other') {
        onOther?.();
      }
    },
    [onFeedback, onOther, upStore],
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
      <Ariakit.PopoverAnchor
        store={upStore}
        render={
          <button
            className={buttonClasses(feedback?.rating === 'thumbsUp', isLast)}
            onClick={handleThumbsUpClick}
            type="button"
            title={localize('com_ui_feedback_positive')}
            aria-pressed={feedback?.rating === 'thumbsUp'}
            aria-haspopup="menu"
          >
            <ThumbUpIcon size="19" bold={feedback?.rating === 'thumbsUp'} />
          </button>
        }
      />
      <Ariakit.Popover
        store={upStore}
        gutter={8}
        portal
        unmountOnHide
        className="popover-animate flex w-auto flex-col gap-1.5 overflow-hidden rounded-2xl border border-border-medium bg-surface-secondary p-1.5 shadow-lg"
      >
        <div className="flex flex-col items-stretch justify-center">
          {positiveTags.map((tag) => (
            <FeedbackOptionButton
              key={tag.key}
              tag={tag}
              active={upActive === tag.key}
              onClick={handleUpOption(tag)}
            />
          ))}
        </div>
      </Ariakit.Popover>

      <button
        className={buttonClasses(feedback?.rating === 'thumbsDown', isLast)}
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

function buttonClasses(isActive: boolean, isLast: boolean) {
  return cn(
    'hover-button rounded-lg p-1.5 text-text-secondary-alt',
    'hover:text-text-primary hover:bg-surface-hover',
    'md:group-hover:visible md:group-focus-within:visible md:group-[.final-completion]:visible',
    !isLast && 'md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100',
    'focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white focus-visible:outline-none',
    isActive && 'active text-text-primary bg-surface-hover',
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
  const [openProductFeedback, setOpenProductFeedback] = useState(false);
  const [feedback, setFeedback] = useState<TFeedback | undefined>(initialFeedback);
  const { data: startupConfig } = useGetStartupConfig();
  const productFeedbackEnabled = startupConfig?.productFeedbackEnabled === true;
  const submitProductFeedback = useSubmitProductFeedbackMutation();

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

  const handleProductFeedbackSubmit = useCallback(
    (payload: ProductFeedbackPayload) => {
      // Store the full feedback payload as JSON in the existing feedback text field
      handleFeedback({
        feedback: {
          rating: 'thumbsDown',
          text: JSON.stringify({
            request_id: payload.request_id,
            feedback_reason: payload.feedback_reason,
            feedback_title: payload.feedback_title,
            feedback_details: payload.feedback_details,
            feedback_suggested_fix: payload.feedback_suggested_fix,
            conversation_id: payload.conversation_id,
            message_id: payload.message_id,
            messages: payload.messages,
            endpoint: payload.endpoint,
            model: payload.model,
            agent_id: payload.agent_id,
          }),
        },
      });

      const mutationPayload = {
        request_id: payload.request_id,
        user: { username: payload.user_email ?? payload.user_id ?? '' },
        timestamp: new Date().toISOString(),
        feedback_reason: payload.feedback_reason,
        feedback_title: payload.feedback_title,
        feedback_details: payload.feedback_details,
        feedback_suggested_fix: payload.feedback_suggested_fix,
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
            message: localize('com_ui_product_feedback_success' as Parameters<typeof localize>[0]),
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

  const renderSingleFeedbackButton = () => {
    if (!feedback) return null;
    const isThumbsUp = feedback.rating === 'thumbsUp';
    const Icon = isThumbsUp ? ThumbUpIcon : ThumbDownIcon;
    const label = isThumbsUp
      ? localize('com_ui_feedback_positive')
      : localize('com_ui_feedback_negative');
    return (
      <button
        className={buttonClasses(true, isLast)}
        onClick={() => {
          if (isThumbsUp) {
            handleButtonFeedback(undefined);
          } else {
            setOpenDialog(true);
          }
        }}
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
          productFeedbackEnabled={productFeedbackEnabled}
        />
      )}
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
        />
      )}
    </>
  );
}
