import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'app_theme.dart';
import 'features/auth/login_screen.dart';
import 'features/home/home_screen.dart';
import 'models/user.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Firebase는 모바일/데스크탑 네이티브에서만 초기화한다.
  // (현재 MVP의 web/index.html에는 Firebase JS SDK가 포함되지 않음 → 웹은 스킵.)
  if (!kIsWeb) {
    // 모바일 Firebase 의존이 추가되면 여기에 Firebase.initializeApp() 호출.
  }

  runApp(const BarofarmApp());
}

class BarofarmApp extends StatelessWidget {
  const BarofarmApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '바로팜',
      theme: buildDarkTheme(),
      darkTheme: buildDarkTheme(),
      themeMode: ThemeMode.dark,
      debugShowCheckedModeBanner: false,
      home: const _RootGate(),
    );
  }
}

class _RootGate extends StatefulWidget {
  const _RootGate();

  @override
  State<_RootGate> createState() => _RootGateState();
}

class _RootGateState extends State<_RootGate> {
  static const _storage = FlutterSecureStorage();
  Future<User?>? _bootstrap;

  @override
  void initState() {
    super.initState();
    _bootstrap = _loadUser();
  }

  Future<User?> _loadUser() async {
    // FlutterSecureStorage 일부 플랫폼(특히 웹) 미지원 케이스 보호.
    try {
      final raw = await _storage.read(key: 'current_user');
      if (raw == null || raw.isEmpty) return null;
      return User.fromJsonString(raw);
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<User?>(
      future: _bootstrap,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        final user = snapshot.data;
        if (user == null) return const LoginScreen();
        return HomeScreen(user: user);
      },
    );
  }
}
