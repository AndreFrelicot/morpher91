import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, AlertDialog } from "radix-ui";
import { afterEach, expect, it } from "vitest";
import { ModalBackdrop } from "./ModalBackdrop";

afterEach(cleanup);

it.each(["dialog", "alert"])(
  "keeps focus and outside-dismissal rules for a %s without a second scroll lock",
  async (kind) => {
    const Modal = kind === "dialog" ? Dialog : AlertDialog;
    const user = userEvent.setup();
    render(
      <>
        <button>Background</button>
        <Modal.Root defaultOpen>
          <Modal.Portal>
            <ModalBackdrop data-testid="backdrop" />
            <Modal.Content>
              <Modal.Title>Test modal</Modal.Title>
              <Modal.Description>Modal body</Modal.Description>
              {kind === "alert" ? (
                <AlertDialog.Cancel>Inside</AlertDialog.Cancel>
              ) : (
                <button>Inside</button>
              )}
            </Modal.Content>
          </Modal.Portal>
        </Modal.Root>
      </>,
    );
    expect(document.body.style.pointerEvents).toBe("none");
    const content = screen.getByRole(
      kind === "dialog" ? "dialog" : "alertdialog",
    );
    await user.tab();
    expect(content).toContainElement(document.activeElement as HTMLElement);
    // jsdom does not load Tailwind; emulate pointer-events-auto on the backdrop.
    const backdrop = screen.getByTestId("backdrop");
    backdrop.style.pointerEvents = "auto";
    await user.click(backdrop);
    if (kind === "dialog") {
      expect(content).not.toBeInTheDocument();
      expect(screen.queryByTestId("backdrop")).toBeNull();
    } else {
      expect(content).toBeInTheDocument();
    }
  },
);
