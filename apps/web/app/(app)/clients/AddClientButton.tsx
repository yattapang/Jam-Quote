"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal, { modalStyles } from "@/components/ui/Modal";
import { createClient } from "@/lib/api-client";
import { PARISHES } from "@jamquote/core";

const parishOptions = [{ value: "", label: "Select parish…" }, ...PARISHES.map((p) => ({ value: p, label: p }))];

export default function AddClientButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [parish, setParish] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim()) return setError("First name is required.");
    setSaving(true);
    setError("");
    try {
      await createClient({
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        parish: parish || undefined,
        addressLine: address.trim() || undefined,
      });
      setOpen(false);
      setFirstName("");
      setLastName("");
      setPhone("");
      setEmail("");
      setParish("");
      setAddress("");
      router.refresh();
    } catch {
      setError("Couldn't save — is the API running?");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Add client
      </Button>
      {open && (
        <Modal title="Add client" onClose={() => (saving ? null : setOpen(false))}>
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
                {saving ? "Saving…" : "Save client"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
