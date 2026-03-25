import { Injectable, UnauthorizedException, Logger, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    // Create default admin if none exists
    await this.ensureDefaultAdmin();
  }

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.prisma.admin.findUnique({ where: { email } });
    
    if (user && await bcrypt.compare(password, user.password)) {
      const { password: _, ...result } = user;
      return result;
    }
    return null;
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login
    await this.prisma.admin.update({
      where: { id: user.id },
      data: { last_login: new Date() },
    });

    const payload = { email: user.email, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async createAdmin(email: string, password: string, name?: string, role: string = 'admin') {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    return this.prisma.admin.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        created_at: true,
      },
    });
  }

  async changePassword(userId: number, oldPassword: string, newPassword: string) {
    const user = await this.prisma.admin.findUnique({ where: { id: userId } });
    
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isValid = await bcrypt.compare(oldPassword, user.password);
    if (!isValid) {
      throw new UnauthorizedException('Invalid old password');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.prisma.admin.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { message: 'Password changed successfully' };
  }

  private async ensureDefaultAdmin() {
    const adminCount = await this.prisma.admin.count();
    
    if (adminCount === 0) {
      const defaultEmail = this.configService.get('ADMIN_EMAIL', 'admin@cdn.local');
      let defaultPassword = this.configService.get('ADMIN_PASSWORD');

      // Generate secure random password if not provided
      if (!defaultPassword || defaultPassword === 'changeme') {
        defaultPassword = randomBytes(16).toString('hex');
        this.logger.warn('⚠️  SECURITY: Generated random admin password');
        this.logger.warn(`⚠️  Admin Email: ${defaultEmail}`);
        this.logger.warn(`⚠️  Admin Password: ${defaultPassword}`);
        this.logger.warn('⚠️  IMPORTANT: Save this password! Set ADMIN_PASSWORD in .env to persist.');
      }

      await this.createAdmin(defaultEmail, defaultPassword, 'Administrator', 'admin');
      this.logger.log(`✅ Default admin created: ${defaultEmail}`);
    }
  }
}
