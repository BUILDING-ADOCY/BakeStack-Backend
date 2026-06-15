import { Global, Module } from '@nestjs/common';
import { AppwriteMirrorService } from './appwrite-mirror.service';

@Global()
@Module({
  providers: [AppwriteMirrorService],
  exports: [AppwriteMirrorService],
})
export class AppwriteMirrorModule {}
