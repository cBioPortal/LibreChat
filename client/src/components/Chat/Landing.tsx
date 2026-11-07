import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { useRecoilValue } from 'recoil';
import { HatGlasses } from 'lucide-react';
import { easings } from '@react-spring/web';
import { EModelEndpoint, isAgentsEndpoint } from 'librechat-data-provider';
import type { TModelSpec, TConversation } from 'librechat-data-provider';
import { BirthdayIcon, TooltipAnchor, SplitText, useRemScale } from '@librechat/client';
import { useChatContext, useAgentsMapContext, useAssistantsMapContext } from '~/Providers';
import Description, { isHtmlDescription } from '~/components/ui/Description';
import { useGetEndpointsQuery, useGetStartupConfig } from '~/data-provider';
import {
  getIconEndpoint,
  getEntity,
  getModelSpec,
  getModelSpecIconURL,
  getConvoSwitchLogic,
} from '~/utils';
import {
  useLocalize,
  useAuthContext,
  useGreeting,
  useDefaultConvo,
  useNewConvo,
} from '~/hooks';
import store from '~/store';
import { useChatSettings } from '~/Providers/ChatSettingsContext';
import AgentContact from '~/components/Agents/AgentContact';
import ConvoIcon from '~/components/Endpoints/ConvoIcon';

const containerClassName =
  'relative flex h-full items-center justify-center rounded-full bg-presentation text-text-primary';

/** Stable references: fresh literals re-initialized SplitText's springs and
 * re-rendered every grapheme span on each Landing render. */
const greetingAnimationFrom = { opacity: 0, transform: 'translate3d(0,50px,0)' };
const greetingAnimationTo = { opacity: 1, transform: 'translate3d(0,0,0)' };

function getTextSizeClass(text: string | undefined | null) {
  if (!text) {
    return 'text-xl sm:text-2xl';
  }

  if (text.length < 56) {
    return 'text-2xl sm:text-4xl';
  }

  if (text.length < 70) {
    return 'text-xl sm:text-2xl';
  }

  return 'text-lg sm:text-base';
}

export default function Landing({ centerFormOnLanding }: { centerFormOnLanding: boolean }) {
  const { conversation } = useChatContext();
  const agentsMap = useAgentsMapContext();
  const assistantMap = useAssistantsMapContext();
  const { data: startupConfig } = useGetStartupConfig();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { user } = useAuthContext();
  const localize = useLocalize();
  const remScale = useRemScale();
  const { isTemporary } = useChatSettings();
  const { newConversation } = useNewConvo();
  const getDefaultConversation = useDefaultConvo();
  const modularChat = useRecoilValue(store.modularChat);

  const [textHasMultipleLines, setTextHasMultipleLines] = useState(false);
  const [lineCount, setLineCount] = useState(1);
  const [contentHeight, setContentHeight] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  const endpointType = useMemo(() => {
    let ep = conversation?.endpoint ?? '';
    if (ep === EModelEndpoint.azureOpenAI) {
      ep = EModelEndpoint.openAI;
    }
    return getIconEndpoint({
      endpointsConfig,
      iconURL: conversation?.iconURL,
      endpoint: ep,
    });
  }, [conversation?.endpoint, conversation?.iconURL, endpointsConfig]);

  const { entity, isAgent } = getEntity({
    endpoint: endpointType,
    agentsMap,
    assistantMap,
    agent_id: conversation?.agent_id,
    assistant_id: conversation?.assistant_id,
  });

  const modelSpec = useMemo(
    () => getModelSpec({ specName: conversation?.spec, startupConfig }),
    [conversation?.spec, startupConfig],
  );

  const currentSpec = useMemo(() => {
    const specs = startupConfig?.modelSpecs?.list ?? [];
    return specs.find(
      (s: TModelSpec) =>
        s.name === conversation?.spec || s.preset?.agent_id === conversation?.agent_id,
    );
  }, [startupConfig?.modelSpecs?.list, conversation?.spec, conversation?.agent_id]);

  const brandedSpecLabel = modelSpec?.showOnLanding ? modelSpec.label : '';
  const brandedSpecDescription = (modelSpec?.showOnLanding && modelSpec.description) || '';
  const name =
    isTemporary || startupConfig?.interface?.landingHeading === 'greeting'
      ? ''
      : (entity?.name ?? brandedSpecLabel);
  const description = isTemporary
    ? localize('com_ui_temporary_description')
    : ((conversation?.greeting ||
        entity?.description ||
        currentSpec?.description ||
        brandedSpecDescription) ??
      '');
  const descriptionIsHTML = isHtmlDescription(description);
  const selectedAgent =
    isAgent && conversation?.agent_id != null ? agentsMap?.[conversation.agent_id] : undefined;

  const customWelcome =
    typeof startupConfig?.interface?.customWelcome === 'string'
      ? startupConfig.interface.customWelcome
      : undefined;

  const otherSpec = useMemo(() => {
    if (startupConfig?.interface?.showSwitchAgent === false) {
      return undefined;
    }
    const specs = startupConfig?.modelSpecs?.list ?? [];
    const switchableSpecs = specs.filter(
      (s: TModelSpec) => s.showSwitchAgent && isAgentsEndpoint(s.preset?.endpoint),
    );
    if (switchableSpecs.length < 2) {
      return undefined;
    }
    const currentAgentId = conversation?.agent_id;
    const currentIndex = switchableSpecs.findIndex(
      (s: TModelSpec) => s.preset?.agent_id === currentAgentId,
    );
    const nextIndex = (currentIndex + 1) % switchableSpecs.length;
    return switchableSpecs[nextIndex];
  }, [
    startupConfig?.interface?.showSwitchAgent,
    startupConfig?.modelSpecs?.list,
    conversation?.agent_id,
  ]);

  const handleSwitchAgent = useCallback(() => {
    if (!otherSpec) {
      return;
    }
    const preset: NonNullable<TModelSpec['preset']> & { spec?: string } = {
      ...otherSpec.preset,
      iconURL: getModelSpecIconURL(otherSpec),
      spec: otherSpec.name,
    };
    const newEndpoint = preset.endpoint ?? '';
    if (!newEndpoint) {
      return;
    }

    const {
      template,
      shouldSwitch,
      isNewModular,
      newEndpointType,
      isCurrentModular,
      isExistingConversation,
    } = getConvoSwitchLogic({
      newEndpoint,
      modularChat,
      conversation,
      endpointsConfig,
    });

    if (newEndpointType) {
      preset.endpointType = newEndpointType;
    }

    const isModular = isCurrentModular && isNewModular && shouldSwitch;
    if (isExistingConversation && isModular) {
      template.endpointType = newEndpointType as EModelEndpoint | undefined;
      const currentConvo = getDefaultConversation({
        conversation: { ...(conversation ?? {}), endpointType: template.endpointType },
        preset: template,
        cleanOutput: true,
      });
      newConversation({
        template: currentConvo,
        preset,
        keepAddedConvos: true,
      });
      return;
    }

    newConversation({
      template: { ...(template as Partial<TConversation>) },
      preset,
      keepAddedConvos: isModular,
    });
  }, [
    otherSpec,
    modularChat,
    conversation,
    endpointsConfig,
    getDefaultConversation,
    newConversation,
  ]);

  const scheduledGreeting = useGreeting(user?.name);

  const handleLineCountChange = useCallback((count: number) => {
    setTextHasMultipleLines(count > 1);
    setLineCount(count);
  }, []);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.offsetHeight);
    }
  }, [lineCount, description, selectedAgent, remScale]);

  const getDynamicMargin = useMemo(() => {
    let margin = 'mb-0';

    if (lineCount > 2 || (description && description.length > 100)) {
      margin = 'mb-10';
    } else if (lineCount > 1 || (description && description.length > 0)) {
      margin = 'mb-6';
    } else if (textHasMultipleLines) {
      margin = 'mb-4';
    }

    if (contentHeight > 200) {
      margin = 'mb-16';
    } else if (contentHeight > 150) {
      margin = 'mb-12';
    }

    return margin;
  }, [lineCount, description, textHasMultipleLines, contentHeight]);

  const resolvedWelcome =
    customWelcome != null && user?.name
      ? customWelcome.replace(/{{user.name}}/g, user.name)
      : customWelcome;

  const greetingText = isTemporary
    ? localize('com_ui_temporary')
    : (resolvedWelcome ?? scheduledGreeting);

  return (
    <div
      className={`flex w-full shrink-0 transform-gpu flex-col items-center justify-start pb-6 transition-all duration-200 ${centerFormOnLanding ? 'pt-2 sm:pt-4' : 'pt-4'} ${getDynamicMargin}`}
    >
      <div ref={contentRef} className="flex flex-col items-center gap-0 p-2">
        <div
          className={`flex ${textHasMultipleLines ? 'flex-col' : 'flex-col md:flex-row'} items-center justify-center gap-2`}
        >
          <div className={`relative size-10 justify-center ${textHasMultipleLines ? 'mb-2' : ''}`}>
            <div className="avatar-stroke size-full rounded-full dark:after:shadow-none">
              {isTemporary ? (
                <div className={containerClassName}>
                  <HatGlasses className="text-text-primary h-2/3 w-2/3" aria-hidden="true" />
                </div>
              ) : (
                <ConvoIcon
                  agentsMap={agentsMap}
                  assistantMap={assistantMap}
                  conversation={conversation}
                  endpointsConfig={endpointsConfig}
                  containerClassName={containerClassName}
                  context="landing"
                  className="text-text-primary h-2/3 w-2/3"
                  size={41}
                />
              )}
            </div>
            {startupConfig?.showBirthdayIcon && (
              <TooltipAnchor
                className="absolute inset-e-2 bottom-[1.6875rem]"
                description={localize('com_ui_happy_birthday')}
                aria-label={localize('com_ui_happy_birthday')}
              >
                <BirthdayIcon />
              </TooltipAnchor>
            )}
          </div>
          {name ? (
            <div className="flex flex-col items-center gap-0 p-2">
              <SplitText
                key={`split-text-${name}`}
                text={name}
                className={`${getTextSizeClass(name)} text-text-primary font-medium`}
                delay={50}
                textAlign="center"
                animationFrom={greetingAnimationFrom}
                animationTo={greetingAnimationTo}
                easing={easings.easeOutCubic}
                threshold={0}
                rootMargin="0px"
                onLineCountChange={handleLineCountChange}
              />
            </div>
          ) : (
            <SplitText
              key={`split-text-${greetingText}${user?.name ? '-user' : ''}`}
              text={greetingText}
              className={`${getTextSizeClass(greetingText)} text-text-primary font-medium`}
              delay={50}
              textAlign="center"
              animationFrom={greetingAnimationFrom}
              animationTo={greetingAnimationTo}
              easing={easings.easeOutCubic}
              threshold={0}
              rootMargin="0px"
              onLineCountChange={handleLineCountChange}
            />
          )}
        </div>
        <Description
          allowMedia
          description={description}
          className={
            descriptionIsHTML
              ? 'animate-fadeIn text-text-primary mt-4 flex max-w-md items-center justify-center gap-2 text-center text-sm font-normal [&_img]:inline-block [&_img]:h-4 [&_img]:w-4'
              : `animate-fadeIn mt-4 max-w-md text-center text-sm font-normal ${isTemporary ? 'text-text-secondary' : 'text-text-primary'}`
          }
        />
        {otherSpec && !isTemporary && (
          <div className="animate-fadeIn mt-4 flex flex-row items-center gap-3">
            <button
              onClick={handleSwitchAgent}
              className="rounded-full border border-border-light bg-surface-secondary px-4 py-2 text-sm font-medium text-text-primary transition-colors duration-200 hover:bg-surface-tertiary"
            >
              {localize('com_ui_switch_agent')}
            </button>
          </div>
        )}
        {selectedAgent && !isTemporary && (
          <AgentContact
            agent={selectedAgent}
            className="animate-fadeIn mt-2 max-w-md justify-center text-center text-sm"
          />
        )}
      </div>
    </div>
  );
}
