"use client";

import React, { useCallback, useState } from "react";

const getProviderAtIndex = (providers: Provider[], index: number): Provider | undefined => {
  // Enhanced safe array access to avoid object injection
  if (
    Array.isArray(providers) &&
    Number.isInteger(index) &&
    index >= 0 &&
    index < providers.length &&
    Object.hasOwn(providers, index)
  ) {
    return Object.hasOwn(providers, index) ? providers[index] : undefined;
  }
  return undefined;
};

interface Provider {
  type: "google" | "nominatim" | "opencage";
  name: string;
  enabled: boolean;
  priority: number;
  color: string;
}

interface ProviderPriorityListProps {
  providers: Provider[];
  onReorder: (newOrder: Provider[]) => void;
  onToggle: (providerType: string, enabled: boolean) => void;
}

const getProviderIcon = (type: string) => {
  switch (type) {
    case "google":
      return "🗺️";
    case "nominatim":
      return "🌍";
    case "opencage":
      return "🏠";
    default:
      return "📍";
  }
};

// Drag handle component
const DragHandle = ({ enabled }: { enabled: boolean }) => {
  if (!enabled) return null;
  return (
    <div className="cursor-move text-gray-400">
      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
      </svg>
    </div>
  );
};

// Priority badge component
const PriorityBadge = ({ provider }: { provider: Provider }) => (
  <div
    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
      provider.enabled ? `bg-${provider.color}-100 text-${provider.color}-800` : "bg-gray-100 text-gray-400"
    } `}
  >
    {provider.priority}
  </div>
);

// Provider info component
const ProviderInfo = ({ provider }: { provider: Provider }) => (
  <div className="flex flex-1 items-center space-x-3">
    <span className="text-2xl">{getProviderIcon(provider.type)}</span>
    <div>
      <div className="font-medium text-gray-900">{provider.name}</div>
      <div className="text-sm text-gray-500">{provider.enabled ? "Enabled" : "Disabled"}</div>
    </div>
  </div>
);

// Toggle switch component
const ToggleSwitch = ({
  provider,
  onToggle,
}: {
  provider: Provider;
  onToggle: (type: string, enabled: boolean) => void;
}) => {
  const handleToggle = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onToggle(provider.type, e.target.checked);
    },
    [provider.type, onToggle]
  );

  return (
    <label className="relative inline-flex cursor-pointer items-center">
      <span className="sr-only">Toggle {provider.type} provider</span>
      <input type="checkbox" checked={provider.enabled} onChange={handleToggle} className="peer sr-only" />
      <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300" />
    </label>
  );
};

// Provider item component
const ProviderItem = ({
  provider,
  index,
  handleDragStart,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleDragEnd,
  draggedItem,
  dragOverItem,
  onToggle,
}: {
  provider: Provider;
  index: number;
  handleDragStart: (e: React.DragEvent, index: number) => void;
  handleDragOver: (e: React.DragEvent, index: number) => void;
  handleDragLeave: () => void;
  handleDrop: (e: React.DragEvent, index: number) => void;
  handleDragEnd: () => void;
  draggedItem: number | null;
  dragOverItem: number | null;
  onToggle: (type: string, enabled: boolean) => void;
}) => {
  const handleDragStartWithIndex = useCallback(
    (e: React.DragEvent) => {
      handleDragStart(e, index);
    },
    [handleDragStart, index]
  );

  const handleDragOverWithIndex = useCallback(
    (e: React.DragEvent) => {
      handleDragOver(e, index);
    },
    [handleDragOver, index]
  );

  const handleDropWithIndex = useCallback(
    (e: React.DragEvent) => {
      handleDrop(e, index);
    },
    [handleDrop, index]
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      // Handle keyboard interaction if needed
    }
  }, []);

  return (
    <div
      key={provider.type}
      draggable={provider.enabled}
      onDragStart={handleDragStartWithIndex}
      onDragOver={handleDragOverWithIndex}
      onDragLeave={handleDragLeave}
      onDrop={handleDropWithIndex}
      onDragEnd={handleDragEnd}
      role="button"
      tabIndex={provider.enabled ? 0 : -1}
      onKeyDown={handleKeyDown}
      aria-label={`${provider.type} provider - ${provider.enabled ? "enabled" : "disabled"}`}
      className={`flex items-center rounded-lg border p-4 transition-all duration-200 ${
        provider.enabled
          ? "cursor-move border-gray-200 bg-white hover:shadow-md"
          : "border-gray-100 bg-gray-50 opacity-60"
      } ${draggedItem === index ? "scale-95 opacity-50" : ""} ${dragOverItem === index ? "border-blue-300 bg-blue-50" : ""} `}
    >
      <div className="flex flex-1 items-center space-x-4">
        <DragHandle enabled={provider.enabled} />
        <PriorityBadge provider={provider} />
        <ProviderInfo provider={provider} />
        <ToggleSwitch provider={provider} onToggle={onToggle} />
      </div>
    </div>
  );
};

export const ProviderPriorityList = ({ providers, onReorder, onToggle }: ProviderPriorityListProps) => {
  const [draggedItem, setDraggedItem] = useState<number | null>(null);
  const [dragOverItem, setDragOverItem] = useState<number | null>(null);

  const sortedProviders = [...providers].sort((a, b) => a.priority - b.priority);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedItem(index);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverItem(index);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverItem(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault();

      if (draggedItem == null || draggedItem === dropIndex) {
        setDraggedItem(null);
        setDragOverItem(null);
        return;
      }

      const newProviders = [...sortedProviders];
      const draggedProvider = getProviderAtIndex(newProviders, draggedItem);

      if (!draggedProvider) {
        setDraggedItem(null);
        setDragOverItem(null);
        return;
      }

      // Remove dragged item
      newProviders.splice(draggedItem, 1);

      // Insert at new position
      const actualDropIndex = draggedItem < dropIndex ? dropIndex - 1 : dropIndex;
      newProviders.splice(actualDropIndex, 0, draggedProvider);

      // Update priorities
      const reorderedProviders = newProviders.map((provider, index) => ({
        ...provider,
        priority: index + 1,
      }));

      onReorder(reorderedProviders);
      setDraggedItem(null);
      setDragOverItem(null);
    },
    [draggedItem, sortedProviders, onReorder]
  );

  const handleDragEnd = useCallback(() => {
    setDraggedItem(null);
    setDragOverItem(null);
  }, []);

  return (
    <div className="space-y-2">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Provider Priority</h3>
          <p className="text-sm text-gray-600">
            Drag to reorder providers by priority. Higher providers will be tried first.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {sortedProviders.map((provider, index) => (
          <ProviderItem
            key={provider.type}
            provider={provider}
            index={index}
            handleDragStart={handleDragStart}
            handleDragOver={handleDragOver}
            handleDragLeave={handleDragLeave}
            handleDrop={handleDrop}
            handleDragEnd={handleDragEnd}
            draggedItem={draggedItem}
            dragOverItem={dragOverItem}
            onToggle={onToggle}
          />
        ))}
      </div>

      {sortedProviders.filter((p) => p.enabled).length === 0 && (
        <div className="py-8 text-center text-gray-500">
          <p className="text-lg">No providers are enabled</p>
          <p className="text-sm">Enable at least one provider to use geocoding</p>
        </div>
      )}
    </div>
  );
};
