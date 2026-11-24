import { isPluginError } from '@libs/pluginError';
import { AlertCircle } from 'lucide-react';
import React from 'react';

import { Badge } from '@/components/ui/badge';

type PluginErrorAlertProps = {
  error: unknown;
  className?: string;
};

export function PluginErrorAlert({ error, className }: PluginErrorAlertProps) {
  if (!error) return null;

  const structured = isPluginError(error) ? error : null;
  const message =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : String(error);

  return (
    <div
      className={`p-4 border border-destructive/50 bg-destructive/10 rounded-lg space-y-1.5 ${className || ''}`}
      role="alert"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
        {structured && (
          <Badge variant="destructive" className="text-[11px] font-mono">
            PluginError
          </Badge>
        )}
        {structured?.status !== undefined && (
          <Badge variant="outline" className="text-[11px] font-mono">
            HTTP {structured.status}
          </Badge>
        )}
        <p className="text-sm font-medium text-destructive">{message}</p>
      </div>
      {structured && structured.code !== message && (
        <p className="text-xs text-destructive/80 pl-6">
          Code: {structured.code}
        </p>
      )}
      {structured?.url && (
        <p className="text-xs text-muted-foreground font-mono break-all pl-6">
          {structured.url}
        </p>
      )}
    </div>
  );
}
