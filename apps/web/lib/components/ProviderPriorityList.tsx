"use client";

import React, { useState, useCallback } from "react";

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

export const ProviderPriorityList: React.FC<ProviderPriorityListProps> = ({
  providers,
  onReorder,
  onToggle,
}) => {
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
      
      if (draggedItem === null || draggedItem === dropIndex) {
        setDraggedItem(null);
        setDragOverItem(null);
        return;
      }

      const newProviders = [...sortedProviders];
      const draggedProvider = newProviders[draggedItem];
      
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

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Provider Priority</h3>
          <p className="text-sm text-gray-600">
            Drag to reorder providers by priority. Higher providers will be tried first.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {sortedProviders.map((provider, index) => (
          <div
            key={provider.type}
            draggable={provider.enabled}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            className={`
              flex items-center p-4 border rounded-lg transition-all duration-200
              ${provider.enabled 
                ? "bg-white border-gray-200 cursor-move hover:shadow-md" 
                : "bg-gray-50 border-gray-100 opacity-60"
              }
              ${draggedItem === index ? "opacity-50 scale-95" : ""}
              ${dragOverItem === index ? "border-blue-300 bg-blue-50" : ""}
            `}
          >
            <div className="flex items-center flex-1 space-x-4">
              {/* Drag Handle */}
              {provider.enabled && (
                <div className="text-gray-400 cursor-move">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                  </svg>
                </div>
              )}

              {/* Priority Badge */}
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                ${provider.enabled 
                  ? `bg-${provider.color}-100 text-${provider.color}-800` 
                  : "bg-gray-100 text-gray-400"
                }
              `}>
                {provider.priority}
              </div>

              {/* Provider Info */}
              <div className="flex items-center space-x-3 flex-1">
                <span className="text-2xl">{getProviderIcon(provider.type)}</span>
                <div>
                  <div className="font-medium text-gray-900">{provider.name}</div>
                  <div className="text-sm text-gray-500">
                    {provider.enabled ? "Enabled" : "Disabled"}
                  </div>
                </div>
              </div>

              {/* Toggle Switch */}
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={provider.enabled}
                  onChange={(e) => onToggle(provider.type, e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>
        ))}
      </div>

      {sortedProviders.filter(p => p.enabled).length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p className="text-lg">No providers are enabled</p>
          <p className="text-sm">Enable at least one provider to use geocoding</p>
        </div>
      )}
    </div>
  );
};