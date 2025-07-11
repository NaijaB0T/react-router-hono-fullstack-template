import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

interface ThreeBackgroundProps {
  uploadProgress?: number;
  isUploading?: boolean;
}

export function ThreeBackground({ uploadProgress = 0, isUploading = false }: ThreeBackgroundProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const particlesRef = useRef<THREE.Points>();
  const dataPacketsRef = useRef<THREE.Group>();
  const animationIdRef = useRef<number>();

  useEffect(() => {
    if (!mountRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 5;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ 
      alpha: true, 
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    rendererRef.current = renderer;

    mountRef.current.appendChild(renderer.domElement);

    // Create particle system
    const particleCount = 2000;
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
      // Position
      positions[i] = (Math.random() - 0.5) * 20;
      positions[i + 1] = (Math.random() - 0.5) * 20;
      positions[i + 2] = (Math.random() - 0.5) * 20;

      // Velocity
      velocities[i] = (Math.random() - 0.5) * 0.02;
      velocities[i + 1] = (Math.random() - 0.5) * 0.02;
      velocities[i + 2] = (Math.random() - 0.5) * 0.02;

      // Colors (gradient from blue to purple to pink)
      const colorChoice = Math.random();
      if (colorChoice < 0.33) {
        colors[i] = 0.4; colors[i + 1] = 0.5; colors[i + 2] = 0.9; // Blue
      } else if (colorChoice < 0.66) {
        colors[i] = 0.5; colors[i + 1] = 0.3; colors[i + 2] = 0.8; // Purple
      } else {
        colors[i] = 0.9; colors[i + 1] = 0.4; colors[i + 2] = 0.8; // Pink
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending
    });

    const particles = new THREE.Points(geometry, material);
    particlesRef.current = particles;
    scene.add(particles);

    // Create data packets group
    const dataPacketsGroup = new THREE.Group();
    dataPacketsRef.current = dataPacketsGroup;
    scene.add(dataPacketsGroup);

    // Mouse interaction
    const mouse = new THREE.Vector2();
    const handleMouseMove = (event: MouseEvent) => {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', handleMouseMove);

    // Resize handler
    const handleResize = () => {
      if (!camera || !renderer) return;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);

      // Update particles
      if (particlesRef.current) {
        const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
        
        for (let i = 0; i < positions.length; i += 3) {
          // Floating motion
          positions[i + 1] += Math.sin(Date.now() * 0.001 + positions[i] * 0.01) * 0.001;
          
          // Mouse interaction
          const dx = mouse.x * 5 - positions[i];
          const dy = mouse.y * 5 - positions[i + 1];
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < 2) {
            positions[i] += dx * 0.001;
            positions[i + 1] += dy * 0.001;
          }

          // Reset particles that drift too far
          if (Math.abs(positions[i]) > 10 || Math.abs(positions[i + 1]) > 10 || Math.abs(positions[i + 2]) > 10) {
            positions[i] = (Math.random() - 0.5) * 20;
            positions[i + 1] = (Math.random() - 0.5) * 20;
            positions[i + 2] = (Math.random() - 0.5) * 20;
          }
        }
        
        particlesRef.current.geometry.attributes.position.needsUpdate = true;
        
        // Rotate particle system slowly
        particlesRef.current.rotation.y += 0.001;
        particlesRef.current.rotation.x += 0.0005;
      }

      // Update data packets if uploading
      if (isUploading && dataPacketsRef.current) {
        updateDataPackets();
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Data packet animation function
  const updateDataPackets = () => {
    if (!dataPacketsRef.current || !sceneRef.current) return;

    // Add new data packets periodically
    if (Math.random() < 0.1) {
      const geometry = new THREE.SphereGeometry(0.02, 8, 8);
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(Math.random() * 0.3 + 0.6, 0.8, 0.6),
        transparent: true,
        opacity: 0.8
      });
      
      const packet = new THREE.Mesh(geometry, material);
      packet.position.set(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 5
      );
      
      // Store velocity as user data
      packet.userData = {
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1,
          Math.random() * 0.05 + 0.02
        )
      };
      
      dataPacketsRef.current.add(packet);
    }

    // Update existing packets
    const packetsToRemove: THREE.Mesh[] = [];
    dataPacketsRef.current.children.forEach((child) => {
      if (child instanceof THREE.Mesh && child.userData.velocity) {
        child.position.add(child.userData.velocity);
        
        // Fade out as they move
        if (child.material instanceof THREE.MeshBasicMaterial) {
          child.material.opacity *= 0.995;
        }
        
        // Remove if too far or too faded
        if (child.position.z > 10 || (child.material as THREE.MeshBasicMaterial).opacity < 0.1) {
          packetsToRemove.push(child);
        }
      }
    });

    // Clean up old packets
    packetsToRemove.forEach(packet => {
      dataPacketsRef.current?.remove(packet);
      packet.geometry.dispose();
      if (packet.material instanceof THREE.Material) {
        packet.material.dispose();
      }
    });
  };

  // Update particles based on upload progress
  useEffect(() => {
    if (particlesRef.current) {
      const material = particlesRef.current.material as THREE.PointsMaterial;
      const baseOpacity = 0.6;
      const progressMultiplier = isUploading ? 1 + (uploadProgress / 100) * 0.5 : 1;
      material.opacity = baseOpacity * progressMultiplier;
      material.size = 0.05 * progressMultiplier;
    }
  }, [uploadProgress, isUploading]);

  return (
    <div 
      ref={mountRef} 
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 1 }}
    />
  );
}