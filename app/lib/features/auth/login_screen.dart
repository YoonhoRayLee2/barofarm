import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../app_theme.dart';
import '../../services/api_service.dart';
import '../../utils/responsive.dart';
import '../home/home_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _nameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  bool _loading = false;

  Future<void> _submit() async {
    final name = _nameCtrl.text.trim();
    final phone = _phoneCtrl.text.trim();
    if (name.isEmpty || phone.isEmpty) return;

    setState(() => _loading = true);
    try {
      final user = await ApiService()
          .createUser(name: name, phone: phone);
      const storage = FlutterSecureStorage();
      await storage.write(key: 'current_user', value: user.toJsonString());

      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => HomeScreen(user: user)),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('오류가 발생했어요: $e')),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: context.isMobile
            ? Padding(
                padding: const EdgeInsets.all(24),
                child: _buildForm(context),
              )
            : Center(
                child: SingleChildScrollView(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 420),
                      child: Container(
                        decoration: BoxDecoration(
                          color: AppColors.surface,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: AppColors.line),
                        ),
                        padding: const EdgeInsets.all(36),
                        child: _buildForm(context),
                      ),
                    ),
                  ),
                ),
              ),
      ),
    );
  }

  Widget _buildForm(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (context.isMobile) const SizedBox(height: 48),
        // Logo
        Image.asset(
          'assets/barofarm_logo.png',
          height: 72,
          fit: BoxFit.contain,
          alignment: Alignment.centerLeft,
        ),
        const SizedBox(height: 8),
        const Text(
          '산지에서 식탁까지, 가장 짧은 거리',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w400,
            color: AppColors.inkMute,
            height: 1.55,
          ),
        ),
        SizedBox(height: context.isMobile ? 48 : 32),
        // Name field
        TextField(
          controller: _nameCtrl,
          style: const TextStyle(color: AppColors.ink, fontSize: 16),
          decoration: const InputDecoration(hintText: '이름'),
          textInputAction: TextInputAction.next,
        ),
        const SizedBox(height: 12),
        // Phone field
        TextField(
          controller: _phoneCtrl,
          style: const TextStyle(color: AppColors.ink, fontSize: 16),
          decoration: const InputDecoration(hintText: '전화번호'),
          keyboardType: TextInputType.phone,
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _submit(),
        ),
        const SizedBox(height: 32),
        // CTA button
        SizedBox(
          width: double.infinity,
          height: 52,
          child: ElevatedButton(
            onPressed: _loading ? null : _submit,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.cta,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              textStyle: const TextStyle(
                  fontSize: 16, fontWeight: FontWeight.w700),
            ),
            child: _loading
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : const Text('시작하기'),
          ),
        ),
      ],
    );
  }
}

