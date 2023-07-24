import * as cdk from 'aws-cdk-lib';
import * as AppsyncNeptune from '../lib/appsync-neptune-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new AppsyncNeptune.AppsyncNeptuneStack(app, 'MyTestStack');
});
