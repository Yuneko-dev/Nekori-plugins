import React, { useState, useEffect } from 'react';
import { CheckedState } from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import useDebounce from '@/hooks/useDebounce';
import { useAppStore } from '@/store';
import { storage } from '@libs/storage';
import { Switch } from '@/components/ui/switch';

export default function SettingsSection() {
  const [cookies, setCookies] = useState('');
  const [useUserAgent, setUseUserAgent] = useState<CheckedState>(true);
  const [loading, setLoading] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);

  const debouncedCookies = useDebounce(cookies, 500);

  const plugin = useAppStore(state => state.plugin);
  const [pluginSettingValues, setPluginSettingValues] = useState<
    Record<string, any>
  >({});

  useEffect(() => {
    if (plugin?.pluginSettings) {
      const vals: Record<string, any> = {};
      Object.entries(plugin.pluginSettings).forEach(([key, setting]) => {
        const stored = storage.get(key);
        vals[key] = stored !== undefined ? stored : setting.value;
      });
      setPluginSettingValues(vals);
    }
  }, [plugin]);

  const handlePluginSettingChange = (key: string, value: any) => {
    setPluginSettingValues(prev => ({ ...prev, [key]: value }));
    storage.set(key, value);
    setAlertVisible(true);
  };

  useEffect(() => {
    window
      .electronAPI!.invoke('settings:get')
      .then((data: any) => {
        if (data.cookies !== undefined) setCookies(data.cookies || '');
        if (data.useUserAgent !== undefined) setUseUserAgent(data.useUserAgent);
      })
      .catch((err: any) => console.error('Failed to load settings:', err))
      .finally(() => setInitialLoaded(true));
  }, []);

  useEffect(() => {
    if (alertVisible) {
      const id = setTimeout(() => setAlertVisible(false), 2000);
      return () => clearTimeout(id);
    }
  }, [alertVisible]);

  useEffect(() => {
    if (!initialLoaded) return;
    setLoading(true);

    const settingsData = {
      cookies: debouncedCookies,
      useUserAgent: useUserAgent === true,
    };

    window
      .electronAPI!.invoke('settings:set', settingsData)
      .then(() => setAlertVisible(true))
      .catch((error: any) => console.error('Failed to save settings:', error))
      .finally(() => setLoading(false));
  }, [debouncedCookies, useUserAgent, initialLoaded]);

  return (
    <div className="space-y-6">
      <Card className="p-6 relative">
        {alertVisible && (
          <div className="absolute top-4 right-4 z-10 bg-green-500/90 text-white px-4 py-2 rounded-md flex items-center gap-2 shadow-lg animate-in fade-in slide-in-from-top-2">
            <Check className="w-4 h-4" />
            Settings updated
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Settings</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Settings are automatically saved
            </p>
          </div>
          {loading && (
            <div className="text-sm text-muted-foreground">Saving...</div>
          )}
        </div>

        <div className="space-y-6">
          {/* Plugin Settings Section */}
          {plugin &&
            plugin.pluginSettings &&
            Object.keys(plugin.pluginSettings).length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-px flex-1 bg-border"></div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Plugin Settings
                  </h3>
                  <div className="h-px flex-1 bg-border"></div>
                </div>

                <div className="space-y-6">
                  {Object.entries(plugin.pluginSettings).map(
                    ([key, setting]) => {
                      const val = pluginSettingValues[key];

                      if (setting.type === 'Switch') {
                        return (
                          <div
                            key={key}
                            className="flex items-center justify-between"
                          >
                            <Label
                              htmlFor={`plugin-setting-${key}`}
                              className="font-semibold text-foreground"
                            >
                              {setting.label}
                            </Label>
                            <Switch
                              id={`plugin-setting-${key}`}
                              checked={val === true}
                              onCheckedChange={checked =>
                                handlePluginSettingChange(key, checked)
                              }
                            />
                          </div>
                        );
                      }

                      if (setting.type === 'Text' || !setting.type) {
                        return (
                          <div key={key} className="space-y-2">
                            <Label
                              htmlFor={`plugin-setting-${key}`}
                              className="font-semibold text-foreground"
                            >
                              {setting.label}
                            </Label>
                            <Input
                              id={`plugin-setting-${key}`}
                              value={val || ''}
                              onChange={e =>
                                handlePluginSettingChange(key, e.target.value)
                              }
                            />
                          </div>
                        );
                      }

                      if (setting.type === 'Select') {
                        return (
                          <div key={key} className="space-y-2">
                            <Label
                              htmlFor={`plugin-setting-${key}`}
                              className="font-semibold text-foreground"
                            >
                              {setting.label}
                            </Label>
                            <Select
                              value={String(val)}
                              onValueChange={v =>
                                handlePluginSettingChange(key, v)
                              }
                            >
                              <SelectTrigger id={`plugin-setting-${key}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {setting.options.map((opt: any) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      }

                      if (setting.type === 'CheckboxGroup') {
                        const selectedVals = Array.isArray(val) ? val : [];
                        return (
                          <div key={key} className="space-y-3">
                            <Label className="font-semibold text-foreground">
                              {setting.label}
                            </Label>
                            <div className="space-y-2">
                              {setting.options.map((opt: any) => {
                                const isChecked = selectedVals.includes(
                                  opt.value,
                                );
                                return (
                                  <div
                                    key={opt.value}
                                    className="flex items-center gap-2"
                                  >
                                    <Checkbox
                                      id={`plugin-setting-${key}-${opt.value}`}
                                      checked={isChecked}
                                      onCheckedChange={checked => {
                                        const newArr = checked
                                          ? [...selectedVals, opt.value]
                                          : selectedVals.filter(
                                              (v: string) => v !== opt.value,
                                            );
                                        handlePluginSettingChange(key, newArr);
                                      }}
                                    />
                                    <Label
                                      htmlFor={`plugin-setting-${key}-${opt.value}`}
                                      className="text-sm cursor-pointer"
                                    >
                                      {opt.label}
                                    </Label>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }

                      return null;
                    },
                  )}
                </div>
              </div>
            )}
          {/* Request Configuration Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="h-px flex-1 bg-border"></div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Request Configuration
              </h3>
              <div className="h-px flex-1 bg-border"></div>
            </div>

            <div className="space-y-6">
              {/* User Agent */}
              <div className="space-y-2">
                <Label className="font-semibold text-foreground">
                  Browser User Agent
                </Label>
                <div className="flex items-center gap-3">
                  <Input
                    value={navigator.userAgent}
                    disabled
                    className="font-mono text-xs flex-1 opacity-60"
                    title={navigator.userAgent}
                  />
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <Checkbox
                      id="use-ua"
                      checked={useUserAgent}
                      onCheckedChange={setUseUserAgent}
                    />
                    <Label
                      htmlFor="use-ua"
                      className="text-sm text-foreground cursor-pointer"
                    >
                      Use
                    </Label>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Enable to send your browser's user agent with requests
                </p>
              </div>

              {/* Cookies */}
              <div className="space-y-2">
                <Label
                  htmlFor="cookies"
                  className="font-semibold text-foreground"
                >
                  Cookies
                </Label>
                <Input
                  id="cookies"
                  value={cookies}
                  onChange={e => setCookies(e.target.value.trim())}
                  placeholder="Enter cookies (optional)..."
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Additional cookies to send with requests (optional)
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
