"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal, { modalStyles } from "@/components/ui/Modal";
import { updateClient } from "@/lib/api-client";
import { PARISHES } from "@jamquote/core";
import type { Client } from "@/lib/types";

const parishOptions = [{ value: "", label: "Select parish…" }, ...PARISHES.map((p) => ({ value: p, label: p }))];

/** Header action on the client detail page — mirrors AddClientButton but
 * pre-fills from the existing client and PATCHes instead of POSTing. */
export default function EditClientButton({ client }: { client: Client }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState(client.firstName);
  const [lastName, setLastName] = useState(client.lastName);
  const [phone, setPhone] = useState(client.phone);
  const [email, setEmail] = useState(client.email ?? "");
  const [parish, setParish] = useState<string>(client.parish);
  const [address, setAddress] = useState(client.address);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim()) return setError("First name is required.");
    setSaving(true);
    setError("");
    try {
      await updateClient(client.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        parish: parish || undefined,
        addressLine: address.trim() || undefined,
      });
      setOpen(false);
      router.refresh();
    } catch {
      setError("Couldn't save — is the API running?");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="outlineAccent" size="sm" onClick={() => setOpen(true)}>
        Edit
      </Button>
      {open && (
        <Modal title="Edit client" onClose={() => (saving ? null : setOpen(false))}>
          <form className={modalStyles.form} onSubmit={submit}>
            <div className={modalStyles.row2}>
              <Input label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
              <Input label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            <div className={modalStyles.row2}>
              <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="876 …" />
              <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" />
            </div>
            <Select label="Parish" options={parishOptions} value={parish} onChange={(e) => setParish(e.target.value)} />
            <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
            {error && <span className={modalStyles.error}>{error}</span>}
            <div className={modalStyles.actions}>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit">
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
