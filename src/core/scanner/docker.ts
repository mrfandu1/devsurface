import { DockerComposeController } from '../docker/compose.js';
import type { DockerInfo } from '../types.js';

export async function detectDocker(root: string): Promise<DockerInfo | null> {
  return await new DockerComposeController(root).inspect();
}
