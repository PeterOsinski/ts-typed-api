import express from 'express';
import { z } from 'zod';
import {
    CreateApiDefinition,
    CreateResponses,
    RegisterHandlers,
    UploadedFile
} from '../src';

// Define API with file upload endpoints
const FileUploadApiDefinition = CreateApiDefinition({
    prefix: '/api',
    endpoints: {
        files: {
            // Single file upload
            uploadSingle: {
                path: '/upload/single',
                method: 'POST',
                body: z.object({
                    description: z.string().optional(),
                }),
                fileUpload: {
                    single: {
                        fieldName: 'file',
                        maxSize: 5 * 1024 * 1024, // 5MB
                        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif']
                    }
                },
                responses: CreateResponses({
                    200: z.object({
                        message: z.string(),
                        fileInfo: z.object({
                            originalName: z.string(),
                            size: z.number(),
                            mimetype: z.string()
                        })
                    })
                })
            },

            // Multiple files upload (array)
            uploadMultiple: {
                path: '/upload/multiple',
                method: 'POST',
                body: z.object({
                    category: z.string(),
                }),
                fileUpload: {
                    array: {
                        fieldName: 'files',
                        maxCount: 5,
                        maxSize: 2 * 1024 * 1024, // 2MB per file
                        allowedMimeTypes: ['image/jpeg', 'image/png']
                    }
                },
                responses: CreateResponses({
                    200: z.object({
                        message: z.string(),
                        uploadedFiles: z.array(z.object({
                            originalName: z.string(),
                            size: z.number(),
                            mimetype: z.string()
                        }))
                    })
                })
            },
        }
    }
});

// Create Express app
const app = express();
const port = 3002;

// Note: Don't use express.json() for file upload routes as it conflicts with multipart parsing
// Only use it for non-file routes or apply it selectively

// Register handlers
RegisterHandlers(app, FileUploadApiDefinition, {
    files: {
        uploadSingle: async (req, res) => {
            // req.file contains the uploaded file
            // req.body contains the form data

            const file = req.file as UploadedFile | undefined;

            try {

                // Process the file here (save to disk, upload to cloud, etc.)
                console.log('Uploaded file:', {
                    name: file!.originalname,
                    size: file!.size,
                    type: file!.mimetype
                });

                res.respond(200, {
                    message: 'File uploaded successfully',
                    fileInfo: {
                        originalName: file!.originalname,
                        size: file!.size,
                        mimetype: file!.mimetype
                    }
                });
            } catch (error) {
                console.error('File validation error:', error);

            }
        },

        uploadMultiple: async (req, res) => {
            // req.files contains array of uploaded files
            // req.body contains the form data
            const files = req.files as UploadedFile[] | undefined;

            try {
                // Process the files here
                const uploadedFiles = files!.map(file => ({
                    originalName: file.originalname,
                    size: file.size,
                    mimetype: file.mimetype
                }));
                console.log('Uploaded files:', uploadedFiles, req.body.category);

                res.respond(200, {
                    message: `${uploadedFiles.length} files uploaded successfully`,
                    uploadedFiles
                });

            } catch (error) {
                console.error('Files validation error:', error);

            }
        },
    }
});

app.listen(port, () => {
    console.log(`File upload server listening at http://localhost:${port}`);
    console.log('\nExample curl commands:');
    console.log('\n1. Single file upload:');
    console.log(`curl -X POST http://localhost:${port}/api/upload/single \\`);
    console.log(`  -F "file=@/path/to/image.jpg" \\`);
    console.log(`  -F "description=My uploaded image"`);

    console.log('\n2. Multiple files upload:');
    console.log(`curl -X POST http://localhost:${port}/api/upload/multiple \\`);
    console.log(`  -F "files=@/path/to/image1.jpg" \\`);
    console.log(`  -F "files=@/path/to/image2.png" \\`);
    console.log(`  -F "category=photos"`);

    console.log('\n3. Mixed fields upload:');
    console.log(`curl -X POST http://localhost:${port}/api/upload/mixed \\`);
    console.log(`  -F "avatar=@/path/to/avatar.jpg" \\`);
    console.log(`  -F "documents=@/path/to/doc1.pdf" \\`);
    console.log(`  -F "documents=@/path/to/doc2.txt" \\`);
    console.log(`  -F "title=My Upload" \\`);
    console.log(`  -F "tags=tag1,tag2"`);
});
