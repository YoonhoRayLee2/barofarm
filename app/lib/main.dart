import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'webview_shell.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Firebase 초기화 — firebase_options.dart 없을 경우 안전하게 스킵
  try {
    await Firebase.initializeApp();
  } catch (_) {
    // firebase_options.dart 미생성 환경에서는 무시하고 계속 진행
  }

  runApp(const BarofarmApp());
}

class BarofarmApp extends StatelessWidget {
  const BarofarmApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '바로팜',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark(useMaterial3: true),
      home: const WebViewShell(),
    );
  }
}
