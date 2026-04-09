# Flutter SDK (FFI)

The Flutter SDK uses **Dart FFI** to call into the Rust evaluation core compiled as a native shared library. Evaluation is synchronous and happens on the Dart side with zero async overhead.

## Installation

Add to your `pubspec.yaml`:

```yaml
dependencies:
  launchgate_flutter: ^0.1.0
```

Then run:

```bash
flutter pub get
```

## Quick Start

```dart
import 'package:launchgate_flutter/launchgate_flutter.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final flags = LaunchgateClient(
    serverUrl: 'https://flags.yourcompany.com',
    sdkKey: 'your-sdk-key',
  );

  await flags.connect();

  runApp(
    LaunchgateProvider(client: flags, child: const MyApp()),
  );
}
```

## API Reference

### `LaunchgateClient`

```dart
final client = LaunchgateClient(
  serverUrl: String,     // required — base URL of your Launchgate server
  sdkKey: String?,       // optional — for authenticated servers
  reconnectDelay: Duration(seconds: 3), // optional
);
```

### `client.connect(): Future<void>`

Connects to the SSE stream and waits for the initial flag bootstrap to complete. Call this before calling `isEnabled()`.

### `client.isEnabled(flagKey, userKey, attributes): bool`

Synchronous flag evaluation via FFI. No `async/await` needed.

```dart
final enabled = client.isEnabled(
  'new-onboarding',
  userId,
  {'plan': 'pro', 'country': 'US'},
);
```

### `client.disconnect(): void`

Closes the SSE connection and releases native resources.

## Usage with Provider

```dart
// main.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:launchgate_flutter/launchgate_flutter.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final flags = LaunchgateClient(
    serverUrl: const String.fromEnvironment('LAUNCHGATE_URL'),
    sdkKey: const String.fromEnvironment('LAUNCHGATE_KEY'),
  );
  await flags.connect();

  runApp(
    Provider<LaunchgateClient>.value(
      value: flags,
      child: const MyApp(),
    ),
  );
}
```

```dart
// feature_screen.dart
import 'package:provider/provider.dart';
import 'package:launchgate_flutter/launchgate_flutter.dart';

class FeatureScreen extends StatelessWidget {
  const FeatureScreen({super.key, required this.user});
  final User user;

  @override
  Widget build(BuildContext context) {
    final flags = context.read<LaunchgateClient>();
    final showNewUI = flags.isEnabled(
      'new-feature-screen',
      user.id,
      {'plan': user.plan},
    );

    return showNewUI ? const NewFeatureScreen() : const LegacyFeatureScreen();
  }
}
```

## Usage with Riverpod

```dart
// providers.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:launchgate_flutter/launchgate_flutter.dart';

final launchgateProvider = Provider<LaunchgateClient>((ref) {
  throw UnimplementedError('Override in ProviderScope');
});

// main.dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final flags = LaunchgateClient(serverUrl: '...');
  await flags.connect();

  runApp(
    ProviderScope(
      overrides: [
        launchgateProvider.overrideWithValue(flags),
      ],
      child: const MyApp(),
    ),
  );
}

// In a widget
final flags = ref.read(launchgateProvider);
final enabled = flags.isEnabled('my-flag', userId, {});
```

## Platform Support

| Platform | Status |
|----------|--------|
| Android (arm64-v8a) | Supported |
| Android (armeabi-v7a) | Supported |
| Android (x86_64) | Supported |
| iOS (arm64) | Supported |
| iOS Simulator | Supported |
| macOS | Supported |
| Linux | Supported |
| Windows | Supported |

## Building from Source

If you need to build the native library from source:

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Build for Android
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
cargo build --release --target aarch64-linux-android

# Build for iOS
rustup target add aarch64-apple-ios x86_64-apple-ios
cargo build --release --target aarch64-apple-ios
```
