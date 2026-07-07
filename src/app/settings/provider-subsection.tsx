"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SecretInput } from "./secret-input";

import type { ProviderModelOption } from "./types";

export interface ProviderSubsectionProps {
  title: string;
  description: string;
  baseUrlId: string;
  baseUrl: string;
  onBaseUrlChange: (value: string) => void;
  secretId: string;
  secretLabel: string;
  secretIsSet: boolean;
  secretValue: string;
  onSecretChange: (value: string) => void;
  onSecretClear: () => void;
  testDisabled: boolean;
  testResult: string | null;
  testing: boolean;
  onTest: () => void;
  modelField?: {
    id: string;
    label: string;
    value: string;
    options: ProviderModelOption[];
    loading: boolean;
    onChange: (value: string) => void;
    onRefresh: () => void;
  };
  savedVersion: number;
}

export function ProviderSubsection({
  title,
  description,
  baseUrlId,
  baseUrl,
  onBaseUrlChange,
  secretId,
  secretLabel,
  secretIsSet,
  secretValue,
  onSecretChange,
  onSecretClear,
  testDisabled,
  testResult,
  testing,
  onTest,
  modelField,
  savedVersion,
}: ProviderSubsectionProps) {
  const modelItems = Object.fromEntries(
    modelField?.options.map((option) => [option.id, option.name]) ?? []
  );

  return (
    <div className="border-border flex flex-col gap-4 rounded-sm border p-4">
      <header className="flex flex-col gap-1">
        <h3 className="text-foreground font-sans text-base font-semibold">
          {title}
        </h3>
        <p className="text-muted-foreground font-sans text-sm">{description}</p>
      </header>

      <div className="flex flex-col gap-2">
        <label
          htmlFor={baseUrlId}
          className="text-foreground font-sans text-sm font-medium"
        >
          Base URL
        </label>
        <Input
          id={baseUrlId}
          value={baseUrl}
          onChange={(event) => onBaseUrlChange(event.target.value)}
          data-testid={baseUrlId}
        />
      </div>

      <SecretInput
        key={savedVersion}
        id={secretId}
        label={secretLabel}
        isSet={secretIsSet}
        value={secretValue}
        onChange={onSecretChange}
        onClear={onSecretClear}
        data-testid={secretId}
      />

      {modelField ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor={modelField.id}
              className="text-foreground font-sans text-sm font-medium"
            >
              {modelField.label}
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={modelField.onRefresh}
              disabled={modelField.loading}
            >
              {modelField.loading ? "Loading…" : "Refresh models"}
            </Button>
          </div>
          <Select
            value={modelField.value || null}
            onValueChange={(value) => {
              if (value) modelField.onChange(value);
            }}
            items={modelItems}
          >
            <SelectTrigger id={modelField.id} data-testid={modelField.id}>
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent>
              {modelField.options.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onTest}
          disabled={testDisabled || testing}
          title={testDisabled ? "Save to test" : undefined}
          data-testid={`${baseUrlId}-test`}
        >
          {testing ? "Testing…" : "Test connection"}
        </Button>
        {testResult ? (
          <p className="text-muted-foreground font-sans text-sm">
            {testResult}
          </p>
        ) : null}
      </div>
    </div>
  );
}
