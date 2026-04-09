<p align="center">
  <img src="../../assets/checkgate_logo.png" width="120" alt="Checkgate Logo">
</p>

# @checkgate/react-native

**Checkgate React Native SDK (JSI)** — The official high-performance mobile client for Checkgate.
Powered by a direct JSI (JavaScript Interface) natively bridging to Rust, this SDK completely avoids strictly serialized asynchronous React Native bridge delays, allowing sub-microsecond synchronous feature toggle evaluations natively on device.

## Installation

```bash
npm install @checkgate/react-native
# iOS requires pod installation
cd ios && pod install
```

## Quick Start

Plug the incredibly fast evaluating `CheckgateProvider` context or native clients directly into your React Native app.

```javascript
import { CheckgateClient } from '@checkgate/react-native'

const client = new CheckgateClient({
  url: 'https://checkgate.your-company.com',
  clientKey: 'pk_mobile_xxxxxx'
})

// Run this during app initialization
client.connect().catch(console.error)

// Later natively inside your RN component lifecycle
function CheckoutScreen({ user }) {
  const showApplePay = client.isEnabled('apple-pay-checkout', { userId: user.id })
  
  return showApplePay ? <ApplePayButton /> : <StandardCheckout />
}
```

## Why Checkgate JSI?
* **Synchronous Native Bridge:** Unlike standard HTTP wrappers, Checkgate's JSI evaluates flag arrays in memory avoiding async JS bridge loading.
* **Bandwidth Conscious:** Streamlined SSE prevents apps from polling the network heavily on metered mobile plans.

Browse the [official Checkgate documentation](https://thinkgrid-labs.github.io/checkgate) for architecture schemas and more.
