import 'package:flutter/material.dart';
import '../../app_theme.dart';
import '../../models/user.dart';

class ChatScreen extends StatelessWidget {
  const ChatScreen({super.key, required this.user});
  final User user;

  @override
  Widget build(BuildContext context) {
    return const Column(
      children: [
        Padding(
          padding: EdgeInsets.fromLTRB(16, 16, 16, 12),
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text(
              '채팅',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.ink),
            ),
          ),
        ),
        Expanded(
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.chat_bubble_outline, size: 48, color: AppColors.inkMute),
                SizedBox(height: 12),
                Text('채팅방이 없어요', style: TextStyle(fontSize: 14, color: AppColors.inkMute)),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
