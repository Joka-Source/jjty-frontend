# AWS tender runner

This creates a private Windows Server 2025 workstation for the Kothali tender (`2026_PWR_1337988_1`). It installs Google Chrome, Amazon DCV, and a MahaTenders desktop shortcut. A fixed AWS address keeps the in-product signing-desk button stable. The machine accepts DCV traffic only from the public IPv4 address used during deployment.

## Use it today

1. Sign in without copying credentials into the project or terminal history:

   ```sh
   aws login
   ```

2. From this directory, deploy and install the native Mac client:

   ```sh
   ./deploy.sh
   ./install-client.sh
   ./connect.sh
   ```

3. Plug in the firm's DSC token. In Amazon DCV on the Mac, open **Preferences → General** and enable **Redirect smartcard devices** before connecting.
4. In Windows, install the token issuer's official middleware if Windows does not already see its certificate. Open the **MahaTenders** desktop shortcut and confirm the firm's certificate is offered at sign-in.

The private key remains inside the DSC token. Amazon DCV presents standards-compatible PC/SC smart cards to Windows; it does not make the USB device appear in Device Manager. A token that requires direct USB access or proprietary PKCS#11-only device access will need a Windows DCV client or a physical Windows signing bridge.

The Terraform state, EC2 private key, and installers stay in `.local/`, which Git ignores. The Windows Administrator password is saved in macOS Keychain and is never printed by the deployment script.

## Cost and shutdown

This uses a `t3.large`, a 60 GB encrypted disk, and a public IPv4 address in `ap-south-1`. AWS bills while these resources exist. Stop the instance in the AWS console between sessions if its desktop state must be retained. When it is no longer needed, remove it completely:

```sh
./destroy.sh
```

Stopping preserves the disk and still incurs storage and public IPv4 charges. Destroying removes the workstation and its disk.
