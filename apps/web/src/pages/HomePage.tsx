import { Card } from "../shared/components";
import { Label } from "../shared/components";

export function HomePage() {
  return (
    <div className="space-y-6">
      <Label variant="title">Home</Label>
      <Card>
        <div className="space-y-2">
          <Label variant="subtitle">Welcome to Epi Web</Label>
          <Label variant="caption">
            Use the sidebar to navigate between sections. The Components page
            shows all available shared UI components with usage examples.
          </Label>
        </div>
      </Card>
    </div>
  );
}
