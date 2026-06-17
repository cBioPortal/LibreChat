import { useMemo, useCallback, useState } from 'react';
import {
  Activity,
  Atom,
  BarChart3,
  Beaker,
  Book,
  BookOpen,
  Brain,
  ChevronDown,
  Compass,
  Database,
  Dna,
  FileText,
  FlaskConical,
  Folder,
  Heart,
  HeartPulse,
  HelpCircle,
  Info,
  LineChart,
  Lightbulb,
  Map as MapIcon,
  MapPin,
  Microscope,
  Navigation as NavigationIcon,
  PieChart,
  Search,
  Server,
  Sparkles,
  Stethoscope,
  Target,
  Telescope,
  TestTube,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EModelEndpoint, Constants } from 'librechat-data-provider';
import type { TModelSpec } from 'librechat-data-provider';
import { useChatContext, useAgentsMapContext, useAssistantsMapContext } from '~/Providers';
import {
  useGetAssistantDocsQuery,
  useGetEndpointsQuery,
  useGetStartupConfig,
} from '~/data-provider';
import { getIconEndpoint, getEntity } from '~/utils';
import { cn } from '~/utils/';
import { useSubmitMessage } from '~/hooks';

// Curated set of icons available to conversation-starter categories.
// Named imports keep lucide-react tree-shaken; an earlier `import *`
// pulled the whole library into the http-client chunk and caused a
// circular-init TDZ crash in production. `Map`/`Navigation` are aliased
// so they don't shadow JS globals at module scope.
const categoryIcons: Record<string, LucideIcon> = {
  Activity,
  Atom,
  BarChart3,
  Beaker,
  Book,
  BookOpen,
  Brain,
  Compass,
  Database,
  Dna,
  FileText,
  FlaskConical,
  Folder,
  Heart,
  HeartPulse,
  HelpCircle,
  Info,
  LineChart,
  Lightbulb,
  Map: MapIcon,
  MapPin,
  Microscope,
  Navigation: NavigationIcon,
  PieChart,
  Search,
  Server,
  Sparkles,
  Stethoscope,
  Target,
  Telescope,
  TestTube,
  Zap,
};

function toPascalCase(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

function resolveCategoryIcon(name?: string | null): LucideIcon | null {
  if (!name) return null;
  for (const key of [name, toPascalCase(name)]) {
    const icon = categoryIcons[key];
    if (icon) return icon;
  }
  return null;
}

const ConversationStarters = () => {
  const { conversation } = useChatContext();
  const agentsMap = useAgentsMapContext();
  const assistantMap = useAssistantsMapContext();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { data: startupConfig } = useGetStartupConfig();
  const [showExamples, setShowExamples] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

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

  const { data: documentsMap = new Map() } = useGetAssistantDocsQuery(endpointType, {
    select: (data) => new Map(data.map((dbA) => [dbA.assistant_id, dbA])),
  });

  const { entity, isAgent } = getEntity({
    endpoint: endpointType,
    agentsMap,
    assistantMap,
    agent_id: conversation?.agent_id,
    assistant_id: conversation?.assistant_id,
  });

  const currentSpec = useMemo(() => {
    const specs = startupConfig?.modelSpecs?.list ?? [];
    return specs.find(
      (spec: TModelSpec) =>
        spec.name === conversation?.spec || spec.preset?.agent_id === conversation?.agent_id,
    );
  }, [startupConfig?.modelSpecs?.list, conversation?.spec, conversation?.agent_id]);

  const conversationStarterCategories = useMemo(() => {
    return (
      currentSpec?.conversationStarterCategories?.filter(
        (category) => category.label && category.starters?.length,
      ) ?? []
    );
  }, [currentSpec?.conversationStarterCategories]);

  const conversation_starters = useMemo(() => {
    if (conversationStarterCategories.length) {
      return [];
    }

    if (currentSpec?.conversation_starters?.length) {
      return currentSpec.conversation_starters;
    }

    if (entity?.conversation_starters?.length) {
      return entity.conversation_starters;
    }

    if (isAgent) {
      return [];
    }

    return documentsMap.get(entity?.id ?? '')?.conversation_starters ?? [];
  }, [conversationStarterCategories.length, currentSpec, documentsMap, isAgent, entity]);

  const { submitMessage } = useSubmitMessage();
  const sendConversationStarter = useCallback(
    (text: string) => submitMessage({ text }),
    [submitMessage],
  );
  const toggleCategory = useCallback((label: string) => {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }, []);

  if (!conversation_starters.length && !conversationStarterCategories.length) {
    return null;
  }

  if (conversationStarterCategories.length) {
    return (
      <div className="mt-6 flex w-full flex-col items-center px-4">
        <button
          type="button"
          onClick={() => setShowExamples((value) => !value)}
          className="rounded-full border border-border-light bg-surface-secondary px-4 py-2 text-sm font-medium text-text-primary transition-colors duration-200 hover:bg-surface-tertiary"
          aria-expanded={showExamples}
        >
          {showExamples ? 'Hide examples' : 'Show examples'}
        </button>
        {showExamples && (
          <div className="mt-5 flex w-full flex-col gap-3 sm:w-11/12 lg:w-4/5 xl:w-2/3">
            {conversationStarterCategories.map((category) => {
              const isExpanded = expandedCategories.has(category.label);
              const Icon =
                resolveCategoryIcon(category.icon) ??
                resolveCategoryIcon(category.label.split(' ')[0]) ??
                Search;

              return (
                <section
                  key={category.label}
                  className={cn(
                    'min-w-0 rounded-lg border border-border-medium bg-surface-primary shadow-[0_0_2px_0_rgba(0,0,0,0.05),0_4px_6px_0_rgba(0,0,0,0.02)] transition-colors duration-200',
                    isExpanded && 'bg-surface-secondary',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleCategory(category.label)}
                    className="flex min-h-16 w-full items-center justify-between gap-3 rounded-lg px-4 py-4 text-left transition-colors duration-200 hover:bg-surface-tertiary"
                    aria-expanded={isExpanded}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border-light bg-surface-secondary">
                        <Icon className="h-4 w-4 text-text-secondary" aria-hidden="true" />
                      </span>
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="text-sm font-semibold text-text-primary">
                          {category.label}
                        </span>
                        {category.description && (
                          <span className="text-xs leading-5 text-text-secondary">
                            {category.description}
                          </span>
                        )}
                      </span>
                    </span>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 shrink-0 text-text-secondary transition-transform duration-200',
                        isExpanded && 'rotate-180',
                      )}
                      aria-hidden="true"
                    />
                  </button>
                  {isExpanded && (
                    <div className="scrollbar-thin flex max-h-72 flex-col gap-2 overflow-y-auto border-t border-border-light px-3 py-3 fade-in">
                      {category.starters.map((text: string, index: number) => (
                        <button
                          key={`${category.label}-${index}`}
                          onClick={() => sendConversationStarter(text)}
                          className="relative min-h-16 w-full cursor-pointer rounded-md border border-border-light bg-transparent px-3 py-2 text-left text-sm transition-colors duration-200 hover:bg-surface-tertiary"
                        >
                          <span className="line-clamp-3 overflow-hidden break-words text-text-secondary">
                            {text}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap justify-center gap-2 px-4">
      {conversation_starters
        .slice(0, Constants.MAX_CONVO_STARTERS)
        .map((text: string, index: number) => (
          <button
            key={index}
            onClick={() => sendConversationStarter(text)}
            className="cursor-pointer rounded-full border border-border-medium px-4 py-2 text-sm text-text-secondary transition-colors duration-200 fade-in hover:bg-surface-tertiary"
          >
            {text}
          </button>
        ))}
    </div>
  );
};

export default ConversationStarters;
