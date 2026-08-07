import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { useRecoilValue } from 'recoil';
import { easings } from '@react-spring/web';
import { EModelEndpoint, isAgentsEndpoint } from 'librechat-data-provider';
import type { TModelSpec, TConversation } from 'librechat-data-provider';
import { BirthdayIcon, TooltipAnchor, SplitText } from '@librechat/client';
import {
  getIconEndpoint,
  getEntity,
  getModelSpec,
  getModelSpecIconURL,
  getConvoSwitchLogic,
  createConfigHtmlSanitizer,
  CONFIG_HTML_MEDIA_TAGS,
  CONFIG_HTML_MEDIA_ATTR,
} from '~/utils';
import { useChatContext, useAgentsMapContext, useAssistantsMapContext } from '~/Providers';
import { useGetEndpointsQuery, useGetStartupConfig } from '~/data-provider';
import ConvoIcon from '~/components/Endpoints/ConvoIcon';
import { useLocalize, useAuthContext, useDefaultConvo, useNewConvo } from '~/hooks';
import store from '~/store';

const containerClassName =
  'shadow-stroke relative flex h-full items-center justify-center rounded-full bg-white dark:bg-presentation dark:text-white text-black dark:after:shadow-none ';

function getTextSizeClass(text: string | undefined | null) {
  if (!text) {
    return 'text-xl sm:text-2xl';
  }

  if (text.length < 40) {
    return 'text-2xl sm:text-4xl';
  }

  if (text.length < 70) {
    return 'text-xl sm:text-2xl';
  }

  return 'text-lg sm:text-md';
}

export default function Landing({ centerFormOnLanding }: { centerFormOnLanding: boolean }) {
  const { conversation } = useChatContext();
  const agentsMap = useAgentsMapContext();
  const assistantMap = useAssistantsMapContext();
  const { data: startupConfig } = useGetStartupConfig();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { user } = useAuthContext();
  const localize = useLocalize();
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

  const { entity, isAgent, isAssistant } = getEntity({
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
  const specName = currentSpec?.label?.split(/\s+-\s+/)[0] ?? '';
  const name = entity?.name ?? brandedSpecLabel ?? specName;
  const description =
    (conversation?.greeting ||
      entity?.description ||
      currentSpec?.description ||
      brandedSpecDescription) ?? '';
  // Detect HTML anywhere in the description, not only at the start. Greetings
  // like "Ask X to explore Y. <a …>Learn more</a>" begin with plain text but
  // still contain a link that must be rendered, not shown as escaped source.
  const descriptionIsHTML = /<[a-z][\s\S]*>/i.test(description);

  const sanitizeDescription = useMemo(
    () =>
      createConfigHtmlSanitizer({
        allowedTags: CONFIG_HTML_MEDIA_TAGS,
        allowedAttr: CONFIG_HTML_MEDIA_ATTR,
      }),
    [],
  );

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
    const preset = { ...otherSpec.preset };
    preset.iconURL = getModelSpecIconURL(otherSpec);
    preset.spec = otherSpec.name;
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
        keepLatestMessage: true,
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

  const getGreeting = useCallback(() => {
    if (typeof startupConfig?.interface?.customWelcome === 'string') {
      const customWelcome = startupConfig.interface.customWelcome;
      // Replace {{user.name}} with actual user name if available
      if (user?.name && customWelcome.includes('{{user.name}}')) {
        return customWelcome.replace(/{{user.name}}/g, user.name);
      }
      return customWelcome;
    }

    const now = new Date();
    const hours = now.getHours();

    const dayOfWeek = now.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Early morning (midnight to 4:59 AM)
    if (hours >= 0 && hours < 5) {
      return localize('com_ui_late_night');
    }
    // Morning (6 AM to 11:59 AM)
    else if (hours < 12) {
      if (isWeekend) {
        return localize('com_ui_weekend_morning');
      }
      return localize('com_ui_good_morning');
    }
    // Afternoon (12 PM to 4:59 PM)
    else if (hours < 17) {
      return localize('com_ui_good_afternoon');
    }
    // Evening (5 PM to 8:59 PM)
    else {
      return localize('com_ui_good_evening');
    }
  }, [localize, startupConfig?.interface?.customWelcome, user?.name]);

  const handleLineCountChange = useCallback((count: number) => {
    setTextHasMultipleLines(count > 1);
    setLineCount(count);
  }, []);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.offsetHeight);
    }
  }, [lineCount, description]);

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

  const greetingText =
    typeof startupConfig?.interface?.customWelcome === 'string'
      ? getGreeting()
      : getGreeting() + (user?.name ? ', ' + user.name : '');

  return (
    <div
      className={`flex w-full shrink-0 transform-gpu flex-col items-center justify-start pb-6 transition-all duration-200 ${centerFormOnLanding ? 'pt-2 sm:pt-4' : 'pt-4'} ${getDynamicMargin}`}
    >
      <div ref={contentRef} className="flex flex-col items-center gap-0 p-2">
        <div
          className={`flex ${textHasMultipleLines ? 'flex-col' : 'flex-col md:flex-row'} items-center justify-center gap-2`}
        >
          <div className={`relative size-10 justify-center ${textHasMultipleLines ? 'mb-2' : ''}`}>
            <ConvoIcon
              agentsMap={agentsMap}
              assistantMap={assistantMap}
              conversation={conversation}
              endpointsConfig={endpointsConfig}
              containerClassName={containerClassName}
              context="landing"
              className="h-2/3 w-2/3 text-black dark:text-white"
              size={41}
            />
            {startupConfig?.showBirthdayIcon && (
              <TooltipAnchor
                className="absolute bottom-[27px] right-2"
                description={localize('com_ui_happy_birthday')}
                aria-label={localize('com_ui_happy_birthday')}
              >
                <BirthdayIcon />
              </TooltipAnchor>
            )}
          </div>
          {((isAgent || isAssistant) && name) || name ? (
            <div className="flex flex-col items-center gap-0 p-2">
              <SplitText
                key={`split-text-${name}`}
                text={name}
                className={`${getTextSizeClass(name)} font-medium text-text-primary`}
                delay={50}
                textAlign="center"
                animationFrom={{ opacity: 0, transform: 'translate3d(0,50px,0)' }}
                animationTo={{ opacity: 1, transform: 'translate3d(0,0,0)' }}
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
              className={`${getTextSizeClass(greetingText)} font-medium text-text-primary`}
              delay={50}
              textAlign="center"
              animationFrom={{ opacity: 0, transform: 'translate3d(0,50px,0)' }}
              animationTo={{ opacity: 1, transform: 'translate3d(0,0,0)' }}
              easing={easings.easeOutCubic}
              threshold={0}
              rootMargin="0px"
              onLineCountChange={handleLineCountChange}
            />
          )}
        </div>
        {description &&
          (descriptionIsHTML
            ? (() => {
                const linkMatch = description.match(
                  /<a\s+[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/i,
                );
                const learnMoreUrl = linkMatch ? linkMatch[1] : '';
                const learnMoreText = linkMatch ? linkMatch[2] : '';
                const cleanDesc = description.replace(
                  /\s*(<br\s*\/?\s*>)*\s*<a\s+[^>]*>.*?<\/a>\s*$/i,
                  '',
                );
                return (
                  <>
                    <div
                      className="animate-fadeIn mt-4 flex max-w-md items-center justify-center gap-2 text-center text-sm font-normal text-text-primary [&_img]:inline-block [&_img]:h-4 [&_img]:w-4"
                      dangerouslySetInnerHTML={{ __html: sanitizeDescription(cleanDesc) }}
                    />
                    <div className="animate-fadeIn mt-4 flex flex-row items-center gap-3">
                      {learnMoreUrl && (
                        <a
                          href={learnMoreUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full bg-gray-600 px-4 py-2 text-sm font-medium text-gray-50 transition-colors duration-200 hover:bg-gray-700"
                        >
                          {learnMoreText || 'Learn more'}
                        </a>
                      )}
                      {otherSpec && (
                        <button
                          onClick={handleSwitchAgent}
                          className="rounded-full border border-border-light bg-surface-secondary px-4 py-2 text-sm font-medium text-text-primary transition-colors duration-200 hover:bg-surface-tertiary"
                        >
                          {localize('com_ui_switch_agent')}
                        </button>
                      )}
                    </div>
                  </>
                );
              })()
            : (
              <div className="animate-fadeIn mt-4 max-w-md text-center text-sm font-normal text-text-primary">
                {description}
              </div>
            ))}
      </div>
    </div>
  );
}
