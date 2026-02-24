"use client";

import { useEffect, useState, useTransition } from "react";
import { MessageSquareText } from "lucide-react";

import { submitFeedbackAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export function FloatingFeedback() {
  const [open, setOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const listener = () => setOpen(true);
    window.addEventListener("gvt-open-feedback", listener);
    return () => {
      window.removeEventListener("gvt-open-feedback", listener);
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="fixed bottom-5 right-5 rounded-none px-5" variant="secondary">
          <MessageSquareText className="h-4 w-4" />
          Feedback
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Platform Feedback</DialogTitle>
          <DialogDescription>
            Tell us what is unclear, outdated, or missing. We review every submission and use it to improve the guides.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();

            const form = event.currentTarget;
            const formData = new FormData(form);
            setStatusMessage(null);

            startTransition(async () => {
              const result = await submitFeedbackAction(formData);
              setStatusMessage(result.message);

              if (result.ok) {
                form.reset();
                setOpen(false);
              }
            });
          }}
        >
          <Textarea
            name="message"
            placeholder="What should we improve in this app?"
            required
            maxLength={2000}
          />
          {statusMessage ? <p className="text-sm text-muted-foreground">{statusMessage}</p> : null}
          <Button disabled={isPending} type="submit">
            {isPending ? "Submitting..." : "Send feedback"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
